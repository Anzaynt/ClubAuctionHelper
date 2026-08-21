from pathlib import Path
import sys
import UnityPy

path = Path(sys.argv[1])
env = UnityPy.load(str(path))
print(f'file={path.name}')
for obj in env.objects:
    try:
        data = obj.read()
        name = getattr(data, 'm_Name', '')
        size = len(getattr(data, 'script', b'')) if hasattr(data, 'script') else ''
        print(f'{obj.type.name:16} {obj.path_id:12} {size!s:8} {name}')
    except Exception as exc:
        print(f'{obj.type.name:16} {obj.path_id:12} ERROR {exc}')
