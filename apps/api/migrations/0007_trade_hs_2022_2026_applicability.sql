-- 202601 字典（164 项医疗器械 HS8）在 2022–2026（HS 2022 周期）各年度税则适用性登记
-- 经核对《中华人民共和国进出口税则》（2022–2026 历年 8 位商品目录）：
-- 1) 2023、2024、2025、2026 四个年度全部 164 项八位税号均在列（默认 applicable = 1）；
-- 2) 2022 年度共 163 项适用，唯一未单列子目为 90189080（手术机器人，2023-01-01 起自 90189099 析出增列）。

INSERT INTO trade_hs_year_applicability (dict_version, year, hs8, applicable, basis_note)
SELECT
  '202601',
  2022,
  '90189080',
  0,
  '2022年版中华人民共和国进出口税则尚未单列手术机器人子目（2023年自90189099析出增列）'
WHERE EXISTS (SELECT 1 FROM trade_dict_meta WHERE dict_version = '202601')
ON CONFLICT(dict_version, year, hs8) DO UPDATE SET
  applicable = excluded.applicable,
  basis_note = excluded.basis_note;
