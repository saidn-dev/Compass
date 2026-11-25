"""Launcher: the one command that starts Compass.

Run `python start.py [--port 8765] [--no-browser]`. It creates .venv if missing,
installs server/requirements.txt (again only when that file changes), starts the
server on 127.0.0.1 and opens the browser. Your data is saved in compass.db here.

Phone on the same Wi-Fi: set a passcode once with `python start.py --set-passcode`,
then start with `python start.py --lan`. Other devices must sign in with it.
"""
import argparse
import os
import socket
import subprocess
import sys
import threading
import venv
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VENV = ROOT / ".venv"
REQUIREMENTS = ROOT / "server" / "requirements.txt"
INSTALLED_STAMP = VENV / "compass-installed-requirements.txt"
HOST = "127.0.0.1"  # only --lan opens Compass to the home network, and only behind the passcode
LAN_HOST = "0.0.0.0"
LAN_CONFIG = ROOT / "compass-lan.json"  # the passcode's hash and cookie secret (git-ignored)


def venv_python() -> Path:
    return VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")


def running_in_venv() -> bool:
    return Path(sys.prefix).resolve() == VENV.resolve()


def prepare_venv() -> None:
    """Create .venv and install the server's packages if that hasn't been done yet."""
    if not venv_python().exists():
        print("Creating .venv (first run only)...")
        venv.create(VENV, with_pip=True)
    wanted = REQUIREMENTS.read_text(encoding="utf-8")
    if INSTALLED_STAMP.exists() and INSTALLED_STAMP.read_text(encoding="utf-8") == wanted:
        return
    print("Installing server packages...")
    subprocess.run([str(venv_python()), "-m", "pip", "install", "-q", "--disable-pip-version-check", "-r", str(REQUIREMENTS)], check=True)
    INSTALLED_STAMP.write_text(wanted, encoding="utf-8")


def port_is_free(port: int, host: str = HOST) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind((host, port))
        except OSError:
            return False
    return True


def home_network_ip() -> str | None:
    """This laptop's address on the Wi-Fi. Connecting a UDP socket sends nothing; it only
    asks the system which network card it would use."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
        try:
            s.connect(("10.255.255.255", 1))
            return s.getsockname()[0]
        except OSError:
            return None


def set_passcode() -> None:
    from getpass import getpass

    sys.path.insert(0, str(ROOT / "server"))
    from app.lan import save_passcode

    first = getpass("New Compass passcode (6+ characters): ")
    if getpass("Type it again: ") != first:
        sys.exit("The two didn't match. Nothing was changed.")
    try:
        save_passcode(LAN_CONFIG, first)
    except ValueError as e:
        sys.exit(str(e))
    print("Passcode saved. Every phone that was signed in will need it again.")


def serve(port: int, open_browser: bool, lan: bool) -> None:
    import uvicorn  # only installed inside .venv

    url = f"http://{HOST}:{port}/"
    print(f"Compass is running at {url}  (press Ctrl+C to stop)", flush=True)
    if lan:
        os.environ["COMPASS_LAN"] = str(LAN_CONFIG)
        ip = home_network_ip()
        print(f"On your phone (same Wi-Fi): http://{ip or '<this laptop IP>'}:{port}/", flush=True)
    if open_browser:
        threading.Timer(1.5, webbrowser.open, args=[url]).start()
    uvicorn.run("app.main:app", host=LAN_HOST if lan else HOST, port=port,
                app_dir=str(ROOT / "server"), log_level="warning")


def main() -> None:
    parser = argparse.ArgumentParser(description="Start Compass.")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-browser", action="store_true", help="don't open the browser")
    parser.add_argument("--lan", action="store_true", help="let devices on the home Wi-Fi in, with the passcode")
    parser.add_argument("--set-passcode", action="store_true", help="set the passcode for --lan, then stop")
    args = parser.parse_args()

    if args.set_passcode:
        pass  # no server starts, so the port checks don't apply
    elif args.lan and not LAN_CONFIG.exists():
        sys.exit("Set a passcode first: python start.py --set-passcode")
    elif not 1 <= args.port <= 65535:
        sys.exit("The port must be between 1 and 65535.")
    elif not port_is_free(args.port, LAN_HOST if args.lan else HOST):
        sys.exit(f"Port {args.port} is already in use. Is Compass already running? "
                 f"Close it, or start on another port: python start.py --port {args.port + 1}")

    # compass.db is created in the current folder, so always run from this one.
    os.chdir(ROOT)

    if running_in_venv():
        if args.set_passcode:
            set_passcode()
            return
        serve(args.port, open_browser=not args.no_browser, lan=args.lan)
        return

    prepare_venv()
    # Start again with the .venv's Python, which has the packages installed.
    try:
        code = subprocess.call([str(venv_python()), str(Path(__file__).resolve()), *sys.argv[1:]])
    except KeyboardInterrupt:
        code = 0
    sys.exit(code)


if __name__ == "__main__":
    main()
