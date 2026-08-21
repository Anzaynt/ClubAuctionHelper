import argparse
import csv
import struct
import sys
from collections import Counter
from pathlib import Path
import UnityPy

sys.stdout.reconfigure(encoding='utf-8')
parser = argparse.ArgumentParser(description='Extract AuctionCollectionBaseConfig records from a Unity AssetBundle.')
parser.add_argument('bundle', help='Path to assets_resources_config_resbin_*.ab')
parser.add_argument('--raw-output', default='auction_collections_raw.csv', help='Raw CSV output path')
args = parser.parse_args()

env = UnityPy.load(args.bundle)
raw = None
for obj in env.objects:
    if obj.type.name == 'TextAsset' and obj.read().m_Name == 'AuctionCollectionBaseConfig':
        asset = obj.read().m_Script
        raw = asset.encode('utf-8', 'surrogateescape') if isinstance(asset, str) else asset
        break
if raw is None:
    raise RuntimeError('AuctionCollectionBaseConfig was not found in this AssetBundle')

def u32(pos):
    return struct.unpack_from('>I', raw, pos)[0]

def string_at(pos):
    size = u32(pos)
    start = pos + 4
    end = start + size
    if size < 1 or end > len(raw):
        raise ValueError('invalid string size')
    text = raw[start:end].decode('utf-8')
    if not text.endswith('\0'):
        raise ValueError('missing string terminator')
    return text[:-1], end

def is_record_start(pos):
    try:
        item_id = u32(pos)
        if not 100000 <= item_id <= 10000000:
            return False
        name, after_name = string_at(pos + 4)
        description, _ = string_at(after_name)
        return bool(name) and len(name) <= 32 and len(description) <= 256
    except (UnicodeDecodeError, ValueError, struct.error):
        return False

count = u32(12)
pos = 20
rows = []
for index in range(count):
    if not is_record_start(pos):
        raise ValueError(f'bad record start {index}: {pos}')
    item_id = u32(pos)
    name, pos = string_at(pos + 4)
    description, pos = string_at(pos)
    fields = [u32(pos + i * 4) for i in range(9)]
    pos += 36
    icon, pos = string_at(pos)
    detail_icon, pos = string_at(pos)
    rows.append({
        'id': item_id,
        'name': name,
        'description': description,
        'field_1': fields[0],
        'field_2': fields[1],
        'field_3': fields[2],
        'field_4': fields[3],
        'field_5': fields[4],
        'field_6': fields[5],
        'value': fields[6],
        'field_8': fields[7],
        'field_9': fields[8],
        'icon': icon,
        'detail_icon': detail_icon,
    })
    if index < count - 1:
        for candidate in range(pos, min(pos + 4096, len(raw) - 12)):
            if is_record_start(candidate):
                pos = candidate
                break
        else:
            print('failed_row=', rows[-1])
            print('remaining_hex=', raw[pos:pos+256].hex())
            raise ValueError(f'next record not found after {index}: {pos}')

output = Path(args.raw_output)
output.parent.mkdir(parents=True, exist_ok=True)
with output.open('w', encoding='utf-8-sig', newline='') as file:
    writer = csv.DictWriter(file, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)

print(f'parsed={len(rows)} end={pos} remaining={len(raw)-pos}')
print('prefixes=', Counter('_'.join(row['icon'].split('_')[2:4]) for row in rows))
print('field_values=', {key: sorted({row[key] for row in rows}) for key in ['field_1', 'field_2', 'field_3', 'field_4', 'field_5', 'field_6', 'field_8', 'field_9']})
for row in rows[:15]:
    print(row)
