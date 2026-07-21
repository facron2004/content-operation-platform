#!/usr/bin/env python3
"""分析 dev.db 中历史数据表的日期覆盖与缺口。

用法: python scripts/analyze-history-coverage.py
依赖: 仅标准库 sqlite3
"""
import os
import sqlite3
from datetime import date, datetime, timedelta

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB = os.path.join(ROOT, "prisma", "dev.db")

CONN = sqlite3.connect(DB)
CUR = CONN.cursor()


def q1(sql, *params):
    CUR.execute(sql, params)
    row = CUR.fetchone()
    return row[0] if row else None


def qall(sql, *params):
    CUR.execute(sql, params)
    return CUR.fetchall()


def table_exists(name):
    return q1("SELECT name FROM sqlite_master WHERE type='table' AND name=?", name) is not None


def analyze_inventory():
    """JeeSiteInventoryDailySnapshot: 每日库存快照(历史抓取源)。"""
    print("\n===== JeeSiteInventoryDailySnapshot (每日库存, 历史抓取源) =====")
    if not table_exists("JeeSiteInventoryDailySnapshot"):
        print("  表不存在")
        return
    total = q1('SELECT COUNT(*) FROM "JeeSiteInventoryDailySnapshot"')
    min_d = q1('SELECT MIN("snapshotDate") FROM "JeeSiteInventoryDailySnapshot"')
    max_d = q1('SELECT MAX("snapshotDate") FROM "JeeSiteInventoryDailySnapshot"')
    pkgs = q1('SELECT COUNT(DISTINCT "packageId") FROM "JeeSiteInventoryDailySnapshot"')
    print(f"  总行数: {total}  | 商品数: {pkgs}  | 日期范围: {min_d} ~ {max_d}")
    # 按日分布
    rows = qall(
        'SELECT "snapshotDate", COUNT(*) FROM "JeeSiteInventoryDailySnapshot" GROUP BY "snapshotDate" ORDER BY "snapshotDate"'
    )
    if min_d and max_d:
        d0 = datetime.strptime(min_d, "%Y-%m-%d").date()
        d1 = datetime.strptime(max_d, "%Y-%m-%d").date()
        present = {r[0]: r[1] for r in rows}
        span = (d1 - d0).days + 1
        missing = [ (d0 + timedelta(days=i)).strftime("%Y-%m-%d") for i in range(span) if (d0 + timedelta(days=i)).strftime("%Y-%m-%d") not in present ]
        # 周末不排除(库存仍可能抓)
        print(f"  应覆盖天数: {span}  | 实际有数据: {len(rows)}  | 缺口天数: {len(missing)}")
        if missing:
            # 只打印前后各若干
            shown = missing[:15]
            print(f"  缺口日期示例(前15): {shown}")
            if len(missing) > 15:
                print(f"  ...共 {len(missing)} 个缺口日")


def analyze_orders():
    print("\n===== OrderHeader (订单, JeSite ETL 源) =====")
    if not table_exists("OrderHeader"):
        print("  表不存在")
        return
    total = q1('SELECT COUNT(*) FROM "OrderHeader"')
    # orderTime 是 ISO 字符串 (含 +00:00 时区后缀, SQLite date() 解析不了) → 取前 10 位 YYYY-MM-DD
    min_d = q1('SELECT MIN(substr(CAST("orderTime" AS TEXT),1,10)) FROM "OrderHeader"')
    max_d = q1('SELECT MAX(substr(CAST("orderTime" AS TEXT),1,10)) FROM "OrderHeader"')
    print(f"  总行数: {total}  | 日期范围: {min_d} ~ {max_d}")
    rows = qall('SELECT substr(CAST("orderTime" AS TEXT),1,10) AS d, COUNT(*) FROM "OrderHeader" GROUP BY d ORDER BY d')
    print(f"  有数据的天数: {len(rows)}")
    if rows:
        print(f"  每日分布: {[ (r[0], r[1]) for r in rows ]}")


def analyze_sales_snapshot():
    print("\n===== SalesSnapshot (销量快照, DailyMetrics/PackageSalesDaily 上游) =====")
    if not table_exists("SalesSnapshot"):
        print("  表不存在")
        return
    total = q1('SELECT COUNT(*) FROM "SalesSnapshot"')
    min_t = q1('SELECT MIN("snapshotTime") FROM "SalesSnapshot"')
    max_t = q1('SELECT MAX("snapshotTime") FROM "SalesSnapshot"')
    # snapshotTime 是 epoch 毫秒字符串
    def to_date(v):
        try:
            return datetime.utcfromtimestamp(int(v)/1000).strftime("%Y-%m-%d")
        except Exception:
            return None
    min_d = to_date(min_t) if min_t else None
    max_d = to_date(max_t) if max_t else None
    pkgs = q1('SELECT COUNT(DISTINCT "packageId") FROM "SalesSnapshot"')
    print(f"  总行数: {total}  | 商品数: {pkgs}  | 日期范围: {min_d} ~ {max_d}")
    rows = qall('SELECT date(datetime("snapshotTime"/1000, \'unixepoch\')) AS d, COUNT(*) FROM "SalesSnapshot" GROUP BY d ORDER BY d')
    print(f"  有数据的天数: {len(rows)}")
    if rows:
        print(f"  最近7天: {[ (r[0], r[1]) for r in rows[-7:] ]}")


def analyze_derived():
    for tbl, key in [("DailyMetrics", "date"), ("MerchantDailyMetrics", "date"), ("PackageSalesDaily", "date")]:
        print(f"\n===== {tbl} (派生聚合表) =====")
        if not table_exists(tbl):
            print("  表不存在")
            continue
        total = q1(f'SELECT COUNT(*) FROM "{tbl}"')
        min_d = q1(f'SELECT MIN("{key}") FROM "{tbl}"')
        max_d = q1(f'SELECT MAX("{key}") FROM "{tbl}"')
        pkgs = q1(f'SELECT COUNT(DISTINCT "packageId") FROM "{tbl}"') if tbl == "PackageSalesDaily" else q1(f'SELECT COUNT(DISTINCT "merchantName") FROM "{tbl}"')
        print(f"  总行数: {total}  | 维度数: {pkgs}  | 日期范围: {min_d} ~ {max_d}")


def analyze_packages():
    print("\n===== ContentPackage (商品主表) =====")
    if not table_exists("ContentPackage"):
        print("  表不存在")
        return
    total = q1('SELECT COUNT(*) FROM "ContentPackage"')
    print(f"  商品总数: {total}")


def main():
    if not os.path.exists(DB):
        print(f"DB 不存在: {DB}")
        return
    print(f"DB: {DB}  ({os.path.getsize(DB)} bytes)")
    analyze_packages()
    analyze_inventory()
    analyze_sales_snapshot()
    analyze_orders()
    analyze_derived()
    # 交叉缺口: 有 ContentPackage 但 JeeSiteInventoryDailySnapshot 完全没快照
    print("\n===== 交叉缺口 =====")
    if table_exists("ContentPackage") and table_exists("JeeSiteInventoryDailySnapshot"):
        no_snap = q1(
            'SELECT COUNT(*) FROM "ContentPackage" c WHERE NOT EXISTS (SELECT 1 FROM "JeeSiteInventoryDailySnapshot" s WHERE s."packageId"=c."packageId")'
        )
        print(f"  有商品但零库存快照的 packageId 数: {no_snap}")


if __name__ == "__main__":
    main()
