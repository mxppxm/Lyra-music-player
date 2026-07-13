export CARGO_HOME="$HOME/Library/Caches/puccinialin/cargo"
export RUSTUP_HOME="$HOME/Library/Caches/puccinialin/rustup"
export PATH="$CARGO_HOME/bin:$PATH"
cd "$(dirname "$0")/app"
pnpm tauri dev