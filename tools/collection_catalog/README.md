# ClubAuctionHelper：藏品图鉴数据导出工具

该工具从微信小游戏落在本机的 Unity AssetBundle 中提取“藏品图鉴”，并生成拍卖助手可直接读取的 CSV。当前版本已验证可导出 693 条真实藏品，排除扫描仪、灯、锤等功能道具。

## 目录内容

- `extract_auction_records.py`：从 Unity AssetBundle 提取原始记录。
- `build_collection_csv.mjs`：筛选真实藏品并生成标准 CSV。
- `inspect_unity_bundle.py`：排查更新后的资源包时，用于确认是否包含目标配置。
- `requirements.txt`：Python 依赖。
- `data/`：当前导出的基线数据。

## 前置条件

- Python 3.10 或更新版本
- Node.js 18 或更新版本
- 在微信中打开小游戏的“藏品图鉴”，让最新资源写入本地缓存

安装 Python 依赖：

```cmd
python -m venv .venv
.venv\Scripts\python -m pip install -r tools\collection_catalog\requirements.txt
```

## 1. 定位更新后的资源包

游戏 AppID：`wxbe6846b9b2bcd23f`。

资源通常位于：

```text
%APPDATA%\Tencent\xwechat\radium\users\<微信用户目录>\applet\local\wxbe6846b9b2bcd23f\usr\__GAME_FILE_CACHE\Assets\ab
```

在该目录中寻找最新的 `assets_resources_config_resbin_*.ab`。候选文件需要包含名为 `AuctionCollectionBaseConfig` 的 `TextAsset`：

```cmd
.venv\Scripts\python tools\collection_catalog\inspect_unity_bundle.py <资源包完整路径> | findstr AuctionCollectionBaseConfig
```

若有输出，便是可用于导出的资源包。

## 2. 导出原始记录

```cmd
.venv\Scripts\python tools\collection_catalog\extract_auction_records.py <资源包完整路径> --raw-output data\auction_collections_raw.csv
```

`AuctionCollectionBaseConfig` 内除了藏品，也包含功能道具；原始 CSV 会保留全部记录以方便排查。

## 3. 生成拍卖助手使用的 CSV

```cmd
node tools\collection_catalog\build_collection_csv.mjs data\auction_collections_raw.csv data\藏品图鉴汇总.csv
```

输出列为：`藏品ID`、`名称`、`轮廓`、`价值`、`品质`、`品类`、`描述`、`图标资源ID`。CSV 使用 UTF-8 with BOM，可直接用 Excel 打开。

## 字段规则

| 字段 | 规则 |
| --- | --- |
| 藏品筛选 | 只保留 `field_1 == 1`；`field_1 == 2` 是功能道具 |
| 轮廓 | `field_4 × field_5（field_6 格）` |
| 价值 | `value` |
| 品质 | `field_3`：1 白品、2 绿品、3 蓝品、4 紫品、5 橙品、6 红品 |
| 品类 | `field_2`：1 古董、2 珠宝、3 奢品、4 字画、5 化石、6 茗酿 |

## 更新后核对

- 解析脚本应能找到 `AuctionCollectionBaseConfig`；
- 最终 CSV 的行数 = 藏品数量 + 1（表头）；
- 若新增品质/品类编号，或报“next record not found”，请保留该资源包，并调整解析或映射规则；
- 图标资源 ID 保留在 CSV 中，后续可按该 ID 从同一缓存目录的 `.ab` 文件中提取图片。
