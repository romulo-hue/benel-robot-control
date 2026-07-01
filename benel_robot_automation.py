import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path


WORKSPACE = Path(__file__).resolve().parent
DEFAULT_CONFIG_NAME = "benel-guberman-config.json"
DEFAULT_SCREENSHOT_DIR = Path(os.environ.get("BENEL_SCREENSHOT_DIR", WORKSPACE / "outputs" / "benel-ppbi-screenshots"))
DEFAULT_NODE_PATH = os.environ.get("BENEL_NODE_PATH", "node")
RUNNER_SCRIPT = WORKSPACE / "benel_guberman_report28.mjs"


def parse_args():
    parser = argparse.ArgumentParser(description="Executa os ciclos do robo Benel Guberman a partir de um JSON.")
    parser.add_argument("--config-path", required=True, help="Caminho do arquivo JSON ou de uma pasta com o JSON.")
    parser.add_argument("--cycle-name", action="append", default=[], help="Nome de um ciclo especifico para rodar. Pode repetir.")
    parser.add_argument("--keep-open-last-run", action="store_true", help="Mantem a ultima execucao com a janela aberta.")
    parser.add_argument("--no-screenshot", action="store_true", help="Nao salva screenshot ao final do ciclo.")
    return parser.parse_args()


def resolve_config_path(config_path: str) -> Path:
    target = Path(config_path).expanduser().resolve()
    if not target.exists():
        raise FileNotFoundError(f"Arquivo JSON nao encontrado em {target}")

    if target.is_file():
        return target

    json_files = sorted(target.glob("*.json"), key=lambda item: item.stat().st_mtime, reverse=True)
    if not json_files:
        raise FileNotFoundError(f"A pasta informada nao tem arquivos JSON: {target}")

    preferred = next((item for item in json_files if item.name.lower().startswith("benel-guberman-config")), None)
    selected = preferred or json_files[0]
    print(f"Pasta informada. Usando o JSON selecionado: {selected}")
    return selected


def load_json(config_path: Path) -> dict:
    return json.loads(config_path.read_text(encoding="utf-8"))


def get_latest_screenshot_file():
    if not DEFAULT_SCREENSHOT_DIR.exists():
      return None

    png_files = sorted(DEFAULT_SCREENSHOT_DIR.glob("*.png"), key=lambda item: item.stat().st_mtime, reverse=True)
    return png_files[0] if png_files else None


def resolve_new_screenshot_file(previous_file: Path | None):
    latest_file = get_latest_screenshot_file()
    if latest_file is None:
        return None

    if previous_file is None:
        return latest_file

    latest_stat = latest_file.stat().st_mtime
    previous_stat = previous_file.stat().st_mtime if previous_file.exists() else -1
    if latest_file != previous_file or latest_stat > previous_stat:
        return latest_file

    return None


def send_telegram_photo(bot_token: str, chat_id: str, photo_path: Path, caption: str):
    boundary = "----BenelRobotBoundary"
    photo_bytes = photo_path.read_bytes()
    body_parts = [
        f"--{boundary}\r\n".encode(),
        b'Content-Disposition: form-data; name="chat_id"\r\n\r\n',
        chat_id.encode("utf-8"),
        b"\r\n",
        f"--{boundary}\r\n".encode(),
        f'Content-Disposition: form-data; name="photo"; filename="{photo_path.name}"\r\n'.encode(),
        b"Content-Type: image/png\r\n\r\n",
        photo_bytes,
        b"\r\n",
    ]

    if caption:
        body_parts.extend(
            [
                f"--{boundary}\r\n".encode(),
                b'Content-Disposition: form-data; name="caption"\r\n\r\n',
                caption.encode("utf-8"),
                b"\r\n",
            ]
        )

    body_parts.append(f"--{boundary}--\r\n".encode())
    payload = b"".join(body_parts)

    request = urllib.request.Request(
        url=f"https://api.telegram.org/bot{bot_token}/sendPhoto",
        data=payload,
        method="POST",
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )

    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Falha HTTP ao enviar ao Telegram: {error.code}") from error

    if not result.get("ok"):
        raise RuntimeError(f"Falha ao enviar ao Telegram: {result.get('description', 'erro desconhecido')}")


def build_runner_command(cycle: dict, action_wait_seconds: int, args, is_last_run: bool):
    page = int(cycle.get("page") or 28)
    command = [DEFAULT_NODE_PATH, str(RUNNER_SCRIPT), "--page", str(page)]

    if action_wait_seconds > 0:
        command.extend(["--action-wait-seconds", str(action_wait_seconds)])

    mappings = [
        ("filial", "--filial"),
        ("zona", "--zona"),
        ("situacao", "--situacao"),
        ("centroCusto", "--centro-custo"),
        ("tipoCategoria", "--tipo-categoria"),
        ("frota", "--frota"),
        ("placa", "--placa"),
        ("km", "--km"),
        ("km2", "--km2"),
        ("manutencao", "--manutencao"),
        ("os", "--os"),
        ("venceDia", "--vence-dia"),
    ]

    for field, flag in mappings:
        value = cycle.get(field)
        if value not in (None, ""):
            command.extend([flag, str(value)])

    if args.no_screenshot:
        command.append("--no-screenshot")

    if args.keep_open_last_run and is_last_run:
        command.append("--keep-open")

    return command


def run_cycle(command):
    completed = subprocess.run(command, cwd=WORKSPACE, env=os.environ.copy(), check=False)
    if completed.returncode != 0:
        raise RuntimeError(f"Execucao encerrada com codigo {completed.returncode}.")


def main():
    args = parse_args()
    config_path = resolve_config_path(args.config_path)
    config = load_json(config_path)

    telegram_bot_token = str(config.get("integrations", {}).get("telegram", {}).get("botToken", "") or "")
    action_wait_seconds = int(config.get("schedule", {}).get("actionWaitSeconds", 0) or 0)

    cycles = [cycle for cycle in config.get("cycles", []) if cycle and cycle.get("enabled") is True]
    if args.cycle_name:
        allowed_names = {name.lower() for name in args.cycle_name}
        cycles = [cycle for cycle in cycles if str(cycle.get("name", "")).lower() in allowed_names]

    if not cycles:
        raise RuntimeError("Nenhum ciclo ativo foi encontrado no JSON.")

    expanded_runs = []
    for cycle in cycles:
        repetitions = int(cycle.get("repetitions") or 1)
        repetitions = repetitions if repetitions > 0 else 1
        for index in range(1, repetitions + 1):
            expanded_runs.append(
                {
                    "cycle": cycle,
                    "iteration": index,
                    "total_iterations": repetitions,
                }
            )

    print(f"JSON carregado: {config_path}")
    print(f"Ciclos ativos: {len(cycles)}")
    print(f"Execucoes totais: {len(expanded_runs)}")

    for run_index, run in enumerate(expanded_runs, start=1):
        cycle = run["cycle"]
        print("")
        print(
            f"Iniciando ciclo {run_index}/{len(expanded_runs)}: {cycle.get('name', 'Sem nome')} "
            f"(repeticao {run['iteration']}/{run['total_iterations']})"
        )

        screenshot_before_run = get_latest_screenshot_file()
        command = build_runner_command(cycle, action_wait_seconds, args, run_index == len(expanded_runs))
        run_cycle(command)

        if not cycle.get("telegramEnabled"):
            continue

        chat_id = str(cycle.get("telegramChatId") or "")
        caption = str(cycle.get("telegramMessage") or "")

        if not telegram_bot_token:
            print("Aviso: ciclo com Telegram ativo, mas o token global do bot nao foi preenchido.")
            continue

        if not chat_id:
            print("Aviso: ciclo com Telegram ativo, mas o grupo/chat ID nao foi preenchido.")
            continue

        if args.no_screenshot:
            print("Aviso: ciclo com Telegram ativo, mas a execucao atual esta sem screenshot.")
            continue

        new_screenshot = resolve_new_screenshot_file(screenshot_before_run)
        if new_screenshot is None:
            print("Aviso: nao encontrei um print novo para enviar ao Telegram neste ciclo.")
            continue

        print(f"Enviando print ao Telegram: {new_screenshot}")
        send_telegram_photo(telegram_bot_token, chat_id, new_screenshot, caption)
        print("OK: Print enviado ao Telegram")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:  # noqa: BLE001
        print(error, file=sys.stderr)
        sys.exit(1)
