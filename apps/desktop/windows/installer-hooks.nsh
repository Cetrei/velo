!macro NSIS_HOOK_POSTINSTALL
  DetailPrint "Registering Velo virtual camera DirectShow filter"
  nsExec::ExecToStack '"regsvr32.exe" /s "$INSTDIR\resources\obs-virtualsource.dll"'
  Pop $0
  ${If} $0 != 0
    DetailPrint "Warning: virtual camera driver registration returned exit code $0"
  ${EndIf}
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Unregistering Velo virtual camera DirectShow filter"
  nsExec::ExecToStack '"regsvr32.exe" /u /s "$INSTDIR\resources\obs-virtualsource.dll"'
  Pop $0
!macroend
