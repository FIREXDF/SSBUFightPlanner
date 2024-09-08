import customtkinter as ctk
from tkinter import filedialog, messagebox, Menu
import tkinter as tk
import shutil
import os
import zipfile

class ModManagerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Gestionnaire de Mods")
        self.root.geometry("600x500")

        self.mods_dir = None
        self.yuzu_mods_dir = None
        self.selected_mod = None

        # Initialiser CustomTkinter
        ctk.set_appearance_mode("System")
        ctk.set_default_color_theme("blue")

        if not os.path.exists("data"):
            os.makedirs("data")

        self.run_curl_command()

        # Interface utilisateur
        self.create_widgets()

        # Charger le dossier des mods depuis le fichier de configuration
        self.load_config()

    def run_curl_command(self):
        try:
            os.system('curl -O https://raw.githubusercontent.com/FIREXDF/SSBUFightPlanner/main/download.pyw')
            print(result.stdout)  # Affiche la sortie de la commande curl
        except Exception as e:
            print(f"Erreur lors de l'exécution de la commande curl : {e}")

    def create_widgets(self):
        self.select_mods_button = ctk.CTkButton(self.root, text="Sélectionner le dossier de mods", command=self.select_mods_folder, cursor='hand2')
        self.select_mods_button.pack(pady=10, fill='x')

        self.install_button = ctk.CTkButton(self.root, text="Installer le mod", command=self.install_mod, cursor='hand2')
        self.install_button.pack(pady=5, fill='x')

        self.uninstall_button = ctk.CTkButton(self.root, text="Désinstaller le mod", command=self.uninstall_mod, cursor='hand2')
        self.uninstall_button.pack(pady=5, fill='x')

        self.download_button = ctk.CTkButton(self.root, text="Télécharger un mod", command=self.download_mod, cursor='hand2')
        self.download_button.pack(pady=5, fill='x')

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
        self.context_menu.add_command(label="Réactiver le mod", command=self.reenable_mod)

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

            disabled_mods_dir = os.path.join(self.yuzu_mods_dir, 'disabled_mod')
            if not os.path.exists(disabled_mods_dir):
                os.makedirs(disabled_mods_dir)

            # Lire les mods activés
            mods = [d for d in os.listdir(self.yuzu_mods_dir) if os.path.isdir(os.path.join(self.yuzu_mods_dir, d)) and d != 'disabled_mod']
            
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
                if os.path.exists(mod_path):
                    try:
                        shutil.rmtree(mod_path)
                        self.update_mod_list()
                        messagebox.showinfo("Succès", f"Mod {self.selected_mod} désinstallé.")
                    except Exception as e:
                        messagebox.showerror("Erreur", f"Erreur lors de la suppression du mod : {e}")
                else:
                    self.update_mod_list()
                self.selected_mod = None
                self.selected_mod_label.configure(text="Mod sélectionné : Aucun")
        else:
            messagebox.showwarning("Erreur", "Veuillez sélectionner un mod à désinstaller.")

    def disable_mod(self):
        if self.selected_mod and self.yuzu_mods_dir:
            mod_path = os.path.join(self.yuzu_mods_dir, self.selected_mod)
            disabled_mods_dir = os.path.join(self.yuzu_mods_dir, 'disabled_mod')
            if not os.path.exists(disabled_mods_dir):
                os.makedirs(disabled_mods_dir)
            try:
                if os.path.exists(mod_path):
                    shutil.move(mod_path, os.path.join(disabled_mods_dir, self.selected_mod))
                    self.update_mod_list()
                    messagebox.showinfo("Succès", f"Mod {self.selected_mod} désactivé.")
                else:
                    messagebox.showwarning("Erreur", f"Le mod '{self.selected_mod}' n'existe pas.")
            except Exception as e:
                messagebox.showerror("Erreur", f"Erreur lors de la désactivation du mod : {e}")
        else:
            messagebox.showwarning("Erreur", "Veuillez sélectionner un mod à désactiver.")

    def reenable_mod(self):
        if self.selected_mod and self.yuzu_mods_dir:
            disabled_mods_dir = os.path.join(self.yuzu_mods_dir, 'disabled_mod')
            mod_path = os.path.join(disabled_mods_dir, self.selected_mod)
            if os.path.exists(mod_path):
                try:
                    shutil.move(mod_path, os.path.join(self.yuzu_mods_dir, self.selected_mod))
                    self.update_mod_list()
                    messagebox.showinfo("Succès", f"Mod {self.selected_mod} réactivé.")
                except Exception as e:
                    messagebox.showerror("Erreur", f"Erreur lors de la réactivation du mod : {e}")
            else:
                messagebox.showwarning("Erreur", f"Le mod '{self.selected_mod}' n'existe pas dans le dossier 'disabled_mod'.")
        else:
            messagebox.showwarning("Erreur", "Veuillez sélectionner un mod à réactiver.")

    def show_context_menu(self, event):
        try:
            index = int(self.mod_textbox.index('@%s,%s' % (event.x, event.y)).split('.')[0]) - 1
            mod_list = self.mod_textbox.get('1.0', tk.END).strip().split('\n')
            if 0 <= index < len(mod_list):
                self.selected_mod = mod_list[index].strip()
                self.selected_mod_label.configure(text=f"Mod sélectionné : {self.selected_mod}")
                if self.selected_mod in [d for d in os.listdir(os.path.join(self.yuzu_mods_dir, 'disabled_mod'))]:
                    self.context_menu.entryconfigure("Désactiver le mod", state="disabled")
                    self.context_menu.entryconfigure("Réactiver le mod", state="normal")
                else:
                    self.context_menu.entryconfigure("Désactiver le mod", state="normal")
                    self.context_menu.entryconfigure("Réactiver le mod", state="disabled")
                self.context_menu.post(event.x_root, event.y_root)
            else:
                self.selected_mod = None
        except Exception as e:
            self.selected_mod = None
            print(f"Erreur lors de l'affichage du menu contextuel : {e}")

    def download_mod(self):
        try:
            os.system('download.pyw')
            self.update_mod_list()
        except Exception as e:
            messagebox.showerror("Erreur", f"Erreur lors du téléchargement du mod : {e}")

    def update_textbox_background(self):
        if ctk.get_appearance_mode() == "Dark":
            self.mod_textbox.configure(bg="#2E2E2E", fg="#FFFFFF")
        else:
            self.mod_textbox.configure(bg="#ff0000", fg="#ff0000")

    def save_config(self):
        with open("data/path.txt", "w") as f:
            f.write(self.yuzu_mods_dir if self.yuzu_mods_dir else "")

    def load_config(self):
        if os.path.exists("data/path.txt"):
            with open("data/path.txt", "r") as f:
                self.yuzu_mods_dir = f.read().strip()
                if self.yuzu_mods_dir:
                    self.update_mod_list()

if __name__ == "__main__":
    root = ctk.CTk()
    app = ModManagerApp(root)
    root.mainloop()
