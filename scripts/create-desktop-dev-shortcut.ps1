$project = Split-Path -Parent $PSScriptRoot
$target = Join-Path $project "RL-Performance-Lab-DEV.bat"
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "RL Performance Lab DEV.lnk"

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $target
$shortcut.WorkingDirectory = $project
$shortcut.IconLocation = "$env:SystemRoot\System32\shell32.dll,13"
$shortcut.Description = "Open RL Performance Lab in development mode without typing npm commands"
$shortcut.Save()

Write-Host "Shortcut creado:" $shortcutPath
