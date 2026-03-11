@echo off
:: 관리자 권한으로 네트워크 설정 스크립트 실행
powershell -Command "Start-Process powershell -ArgumentList '-ExecutionPolicy Bypass -File \"%~dp0setup-network-access.ps1\"' -Verb RunAs"
