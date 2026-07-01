import os
import subprocess
import sys
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox, simpledialog


WORKSPACE = Path(r"C:\Users\benel.FRZNBIGOR\Documents\Codex\2026-05-27")
RUNNER_PATH = WORKSPACE / "run_benel_robot_from_config.ps1"
DEFAULT_DOWNLOADS = Path.home() / "Downloads"


def ask_json_file() -> str:
    return filedialog.askopenfilename(
        title="Selecione o arquivo JSON do Benel Robot",
        initialdir=str(DEFAULT_DOWNLOADS if DEFAULT_DOWNLOADS.exists() else WORKSPACE),
        filetypes=[("Arquivos JSON", "*.json"), ("Todos os arquivos", "*.*")],
    )


def ask_credentials(root: tk.Tk) -> tuple[str, str]:
    login_user = os.environ.get("BENEL_LOGIN_USER", "").strip()
    login_password = os.environ.get("BENEL_LOGIN_PASSWORD", "").strip()

    if not login_user:
        login_user = (
            simpledialog.askstring(
                "Usuario do Benel",
                "Digite o usuario de login do Benel:",
                parent=root,
            )
            or ""
        ).strip()

    if not login_password:
        login_password = (
            simpledialog.askstring(
                "Senha do Benel",
                "Digite a senha de login do Benel:",
                parent=root,
                show="*",
            )
            or ""
        ).strip()

    return login_user, login_password


def main() -> int:
    if not RUNNER_PATH.exists():
        print(f"Script nao encontrado: {RUNNER_PATH}", file=sys.stderr)
        return 1

    root = tk.Tk()
    root.withdraw()

    json_path = ask_json_file()
    if not json_path:
        messagebox.showinfo("Benel Robot", "Execucao cancelada: nenhum JSON foi selecionado.")
        return 0

    login_user, login_password = ask_credentials(root)
    if not login_user or not login_password:
        messagebox.showerror("Benel Robot", "Usuario e senha sao obrigatorios para rodar o robo.")
        return 1

    env = os.environ.copy()
    env["BENEL_LOGIN_USER"] = login_user
    env["BENEL_LOGIN_PASSWORD"] = login_password

    command = [
        "powershell",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        str(RUNNER_PATH),
        "-ConfigPath",
        json_path,
    ]

    messagebox.showinfo(
        "Benel Robot",
        "O robo vai iniciar agora em uma janela do PowerShell.\n\n"
        f"JSON selecionado:\n{json_path}",
    )

    completed = subprocess.run(command, env=env, cwd=str(WORKSPACE))
    if completed.returncode != 0:
        messagebox.showerror(
            "Benel Robot",
            f"O robo terminou com erro. Codigo de saida: {completed.returncode}",
        )
        return completed.returncode

    messagebox.showinfo("Benel Robot", "Execucao concluida com sucesso.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
