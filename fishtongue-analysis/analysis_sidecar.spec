# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_data_files

panphon_data = collect_data_files('panphon')
a = Analysis(['analysis_sidecar.py'], pathex=[], binaries=[], datas=panphon_data, hiddenimports=['panphon'], noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='fishtongue-analysis', console=False)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=False, name='fishtongue-analysis')
