import subprocess
import sys

def install(package):
    subprocess.check_call([sys.executable, "-m", "pip", "install", package])

# Liste des bibliothèques nécessaires
required_packages = ["requests", "rarfile", "py7zr", "customtkinter"]

for package in required_packages:
    try:
        __import__(package)
    except ImportError:
        print(f"{package} n'est pas installé. Installation en cours...")
        install(package)

import os
import requests

# URL de téléchargement du fichier
DOWNLOAD_URL = "https://raw.githubusercontent.com/FIREXDF/SSBUFightPlanner/main/download_en.pyw"
FILE_NAME = "download_en.pyw"

def download_file(url, filename):
    """Télécharge un fichier depuis une URL et l'enregistre sous le nom spécifié."""
    try:
        response = requests.get(url)
        response.raise_for_status()  # Lève une exception pour les codes d'erreur
        with open(filename, 'wb') as file:
            file.write(response.content)
        print(f"{filename} a été téléchargé avec succès.")
    except requests.RequestException as e:
        print(f"Erreur lors du téléchargement de {filename} : {e}")

def check_and_download_file():
    """Vérifie si le fichier existe, sinon le télécharge."""
    if not os.path.exists(FILE_NAME):
        print(f"{FILE_NAME} n'est pas présent. Téléchargement en cours...")
        download_file(DOWNLOAD_URL, FILE_NAME)
    else:
        print(f"{FILE_NAME} est déjà présent.")

if __name__ == "__main__":
    check_and_download_file()


import customtkinter as ctk
from tkinter import filedialog, messagebox, Menu
import tkinter as tk
import shutil
import os
import zipfile

class ModManagerApp:
    
    def __init__(self, root):
        self.root = root
        self.root.title("FightPlanner")
        self.root.geometry("600x500")

        self.mods_dir = None
        self.yuzu_mods_dir = None
        self.selected_mod = None

        # Initialisation de CustomTkinter
        ctk.set_appearance_mode("System")
        ctk.set_default_color_theme("blue") 

        if not os.path.exists("data"):
            os.makedirs("data")

        # Interface utilisateur
        self.create_widgets()

        # Charger le dossier de mods à partir du fichier de configuration
        self.load_config()

    def create_widgets(self):

        self.select_mods_button = ctk.CTkButton(self.root, text="Sélectionner le dossier de mods", command=self.select_mods_folder, cursor='hand2')
        self.select_mods_button.pack(pady=10, fill='x')

        self.install_button = ctk.CTkButton(self.root, text="Installer un mod", command=self.install_mod, cursor='hand2')
        self.install_button.pack(pady=5, fill='x')

        self.uninstall_button = ctk.CTkButton(self.root, text="Désinstaller un mod", command=self.uninstall_mod, cursor='hand2')
        self.uninstall_button.pack(pady=5, fill='x')

        self.download_button = ctk.CTkButton(self.root, text="Télécharger un mod depuis Gamebanana", command=self.download_mod, cursor='hand2')
        self.download_button.pack(pady=5, fill='x')

        self.reload_button = ctk.CTkButton(self.root, text="⟳", command=self.update_mod_list, width=20, height=25, cursor='hand2')
        self.reload_button.pack(pady=5)
        self.reload_button.place(x=0, y=150)

        self.scrollable_frame = ctk.CTkScrollableFrame(self.root, width=580, height=4500)
        self.scrollable_frame.pack(pady=10, fill='both', expand=True)

        self.mod_textbox = tk.Text(self.scrollable_frame, width=60, height=25, cursor='arrow', wrap='none')
        self.mod_textbox.pack(side="left", fill="both", expand=True)

        self.mod_textbox.tag_configure("highlight", background="blue", foreground="white")
        self.mod_textbox.tag_configure("disabled", background="red", foreground="darkred")

        self.mod_textbox.bind("<ButtonRelease-1>", self.on_mod_selected)
        self.mod_textbox.bind("<Button-3>", self.show_context_menu)

        self.selected_mod_label = ctk.CTkLabel(self.root, text="Mod sélectionné : Aucun")
        self.selected_mod_label.pack(pady=10)

        self.progress_bar = ctk.CTkProgressBar(self.root, mode="determinate")
        self.progress_bar.pack(pady=10, fill='x')
        self.progress_bar.set(0)
        self.progress_bar.pack_forget()

        self.update_textbox_background()

        # Créer le menu contextuel
        self.context_menu = Menu(self.root, tearoff=0)
        self.context_menu.add_command(label="Désactiver le mod", command=self.disable_mod)
        self.context_menu.add_command(label="Activer le mod", command=self.enable_mod)

    def select_mods_folder(self):
        folder_path = filedialog.askdirectory()
        if folder_path:
            self.yuzu_mods_dir = folder_path
            self.save_config()
            self.update_mod_list()

    def update_mod_list(self):
        if self.yuzu_mods_dir and os.path.isdir(self.yuzu_mods_dir) and hasattr(self, 'mod_textbox'):
            self.mod_textbox.configure(state='normal')
            self.mod_textbox.delete('1.0', tk.END)

            disabled_mods_dir = os.path.join(self.yuzu_mods_dir, '{disabled_mod}')
            if not os.path.exists(disabled_mods_dir):
                os.makedirs(disabled_mods_dir)

            # Lire les mods actifs
            mods = [d for d in os.listdir(self.yuzu_mods_dir) if os.path.isdir(os.path.join(self.yuzu_mods_dir, d)) and d != '{disabled_mod}']
            
            # Lire les mods désactivés
            disabled_mods = [d for d in os.listdir(disabled_mods_dir) if os.path.isdir(os.path.join(disabled_mods_dir, d))]

            all_mods = sorted(mods + disabled_mods)  # Trier les mods par ordre alphabétique

            for mod in all_mods:
                if mod in disabled_mods:
                    self.mod_textbox.insert(tk.END, mod + '\n', "disabled")
                else:
                    self.mod_textbox.insert(tk.END, mod + '\n')

            self.mod_textbox.configure(state='disabled')
        else:
            if self.yuzu_mods_dir:
                messagebox.showwarning("Erreur", "Le dossier de mods sélectionné n'existe pas.")
            else:
                messagebox.showwarning("Erreur", "Veuillez sélectionner un dossier de mods.")

    def on_mod_selected(self, event):
        try:
            index = int(self.mod_textbox.index('insert').split('.')[0]) - 1
            mod_list = self.mod_textbox.get('1.0', tk.END).strip().split('\n')
            if 0 <= index < len(mod_list):
                self.selected_mod = mod_list[index].strip()
                self.selected_mod_label.configure(text=f"Mod sélectionné : {self.selected_mod}")

                self.mod_textbox.tag_remove("highlight", '1.0', tk.END)

                start_index = f'1.0 + {index} lines'
                end_index = f'{start_index} + 1 lines'

                self.mod_textbox.tag_add("highlight", start_index, end_index)
        except Exception as e:
            self.selected_mod = None
            self.selected_mod_label.configure(text="Mod sélectionné : Aucun")
            print(f"Erreur lors de la sélection du mod : {e}")

    def install_mod(self):
        if self.yuzu_mods_dir:
            zip_file_path = filedialog.askopenfilename(filetypes=[("Fichiers ZIP", "*.zip")])
            if zip_file_path:
                dest_path = os.path.join(self.yuzu_mods_dir, os.path.basename(zip_file_path).replace('.zip', ''))
                if not os.path.exists(dest_path):
                    os.makedirs(dest_path)
                try:
                    self.progress_bar.pack(pady=10, fill='x')
                    self.progress_bar.set(0)
                    self.progress_bar.update_idletasks()

                    with zipfile.ZipFile(zip_file_path, 'r') as zip_ref:
                        total_files = len(zip_ref.infolist())
                        for idx, file in enumerate(zip_ref.infolist()):
                            zip_ref.extract(file, dest_path)
                            progress = int((idx + 1) / total_files * 100)
                            self.progress_bar.set(progress)
                            self.root.update_idletasks()
                    self.progress_bar.set(100)
                    messagebox.showinfo("Succès", f"Mod installé dans {dest_path}.")
                    self.update_mod_list()
                except Exception as e:
                    messagebox.showerror("Erreur", f"Erreur lors de l'installation du mod : {e}")
                finally:
                    self.progress_bar.pack_forget()
            else:
                messagebox.showwarning("Erreur", "Aucun fichier ZIP sélectionné.")
        else:
            messagebox.showwarning("Erreur", "Veuillez sélectionner un dossier de mods.")

    def uninstall_mod(self):
        if self.selected_mod and self.yuzu_mods_dir:
            mod_path = os.path.join(self.yuzu_mods_dir, self.selected_mod)
            confirmation = messagebox.askyesno("Confirmation", f"Êtes-vous sûr de désinstaller le mod '{self.selected_mod}' ?")
            if confirmation:
                try:
                    if os.path.exists(mod_path):
                        shutil.rmtree(mod_path)
                        messagebox.showinfo("Succès", f"Mod '{self.selected_mod}' désinstallé.")
                    self.update_mod_list()
                except Exception as e:
                    messagebox.showerror("Erreur", f"Erreur lors de la désinstallation du mod : {e}")
        else:
            messagebox.showwarning("Erreur", "Aucun mod sélectionné ou dossier de mods non défini.")

    def disable_mod(self):
        if self.selected_mod and self.yuzu_mods_dir:
            mod_path = os.path.join(self.yuzu_mods_dir, self.selected_mod)
            disabled_mods_dir = os.path.join(self.yuzu_mods_dir, '{disabled_mod}')
            if not os.path.exists(disabled_mods_dir):
                os.makedirs(disabled_mods_dir)
            try:
                shutil.move(mod_path, os.path.join(disabled_mods_dir, self.selected_mod))
                self.update_mod_list()
            except Exception as e:
                messagebox.showerror("Erreur", f"Erreur lors de la désactivation du mod : {e}")

    def enable_mod(self):
        if self.selected_mod and self.yuzu_mods_dir:
            mod_path = os.path.join(self.yuzu_mods_dir, '{disabled_mod}', self.selected_mod)
            try:
                shutil.move(mod_path, os.path.join(self.yuzu_mods_dir, self.selected_mod))
                self.update_mod_list()
            except Exception as e:
                messagebox.showerror("Erreur", f"Erreur lors de la Activation du mod : {e}")

    def show_context_menu(self, event):
        if self.selected_mod:
            mod_is_disabled = self.selected_mod in [d for d in os.listdir(os.path.join(self.yuzu_mods_dir, '{disabled_mod}'))]
            self.context_menu.entryconfigure("Désactiver le mod", state=tk.NORMAL if not mod_is_disabled else tk.DISABLED)
            self.context_menu.entryconfigure("Activer le mod", state=tk.NORMAL if mod_is_disabled else tk.DISABLED)
            self.context_menu.post(event.x_root, event.y_root)

    def update_textbox_background(self):
        if ctk.get_appearance_mode() == "Dark":
            self.mod_textbox.configure(bg="#2E2E2E", fg="#FFFFFF")
        else:
            self.mod_textbox.configure(bg="#ff0000", fg="#ff0000")

    def download_mod(self):
        try:
            subprocess.Popen(['python', FILE_NAME])
        except FileNotFoundError:
            messagebox.showerror("Erreur", "Impossible de trouver le fichier download.pyw.")

    def load_config(self):
        try:
            with open("data/config.txt", "r") as f:
                self.yuzu_mods_dir = f.readline().strip()
                self.update_mod_list()
        except FileNotFoundError:
            pass

    def save_config(self):
        with open("data/config.txt", "w") as f:
            f.write(self.yuzu_mods_dir)

if __name__ == "__main__":
    root = ctk.CTk()
    app = ModManagerApp(root)
    root.mainloop()
