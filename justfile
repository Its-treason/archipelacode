[windows]
set shell := ["powershell.exe", "-NoLogo", "-Command"]


package-install:
  npx @vscode/vsce package
  code --install-extension C:\Users\Timon\projects\archipelacode\archipelacode-0.0.2.vsix --force
