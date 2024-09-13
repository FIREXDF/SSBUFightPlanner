import subprocess
import sys

def install(package):
    subprocess.check_call([sys.executable, "-m", "pip", "install", package])

# List of required libraries
required_packages = ["requests", "rarfile", "py7zr", "customtkinter"]

for package in required_packages:
    try:
        __import__(package)
    except ImportError:
        print(f"{package} is not installed. Installing...")
        install(package)

import os
import requests

# File download URL
DOWNLOAD_URL = "https://raw.githubusercontent.com/FIREXDF/SSBUFightPlanner/main/download_en.pyw"
FILE_NAME = "download_en.pyw"

def download_file(url, filename):
    """Downloads a file from the URL and saves it under the specified name."""
    try:
        response = requests.get(url)
        response.raise_for_status()  # Raises an exception for error status codes
        with open(filename, 'wb') as file:
            file.write(response.content)
        print(f"{filename} has been downloaded successfully.")
    except requests.RequestException as e:
        print(f"Error downloading {filename}: {e}")

def check_and_download_file():
    """Checks if the file exists, otherwise downloads it."""
    if not os.path.exists(FILE_NAME):
        print(f"{FILE_NAME} is not present. Downloading...")
        download_file(DOWNLOAD_URL, FILE_NAME)
    else:
        print(f"{FILE_NAME} is already present.")

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

        # Initialize CustomTkinter
        ctk.set_appearance_mode("System")
        ctk.set_default_color_theme("blue") 

        if not os.path.exists("data"):
            os.makedirs("data")

        # User interface
        self.create_widgets()

        # Load mods folder from configuration file
        self.load_config()

    def create_widgets(self):

        self.select_mods_button = ctk.CTkButton(self.root, text="Select mods folder", command=self.select_mods_folder, cursor='hand2')
        self.select_mods_button.pack(pady=10, fill='x')

        self.install_button = ctk.CTkButton(self.root, text="Install mod", command=self.install_mod, cursor='hand2')
        self.install_button.pack(pady=5, fill='x')

        self.uninstall_button = ctk.CTkButton(self.root, text="Uninstall mod", command=self.uninstall_mod, cursor='hand2')
        self.uninstall_button.pack(pady=5, fill='x')

        self.download_button = ctk.CTkButton(self.root, text="Download mod from Gamebanana", command=self.download_mod, cursor='hand2')
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

        self.selected_mod_label = ctk.CTkLabel(self.root, text="Selected mod: None")
        self.selected_mod_label.pack(pady=10)

        self.progress_bar = ctk.CTkProgressBar(self.root, mode="determinate")
        self.progress_bar.pack(pady=10, fill='x')
        self.progress_bar.set(0)
        self.progress_bar.pack_forget()

        self.update_textbox_background()

        # Create context menu
        self.context_menu = Menu(self.root, tearoff=0)
        self.context_menu.add_command(label="Disable mod", command=self.disable_mod)
        self.context_menu.add_command(label="Enable mod", command=self.enable_mod)

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

            # Read active mods
            mods = [d for d in os.listdir(self.yuzu_mods_dir) if os.path.isdir(os.path.join(self.yuzu_mods_dir, d)) and d != '{disabled_mod}']
            
            # Read disabled mods
            disabled_mods = [d for d in os.listdir(disabled_mods_dir) if os.path.isdir(os.path.join(disabled_mods_dir, d))]

            all_mods = sorted(mods + disabled_mods)  # Sort mods alphabetically

            for mod in all_mods:
                if mod in disabled_mods:
                    self.mod_textbox.insert(tk.END, mod + '\n', "disabled")
                else:
                    self.mod_textbox.insert(tk.END, mod + '\n')

            self.mod_textbox.configure(state='disabled')
        else:
            if self.yuzu_mods_dir:
                messagebox.showwarning("Error", "The selected mods folder does not exist.")
            else:
                messagebox.showwarning("Error", "Please select a mods folder.")

    def on_mod_selected(self, event):
        try:
            index = int(self.mod_textbox.index('insert').split('.')[0]) - 1
            mod_list = self.mod_textbox.get('1.0', tk.END).strip().split('\n')
            if 0 <= index < len(mod_list):
                self.selected_mod = mod_list[index].strip()
                self.selected_mod_label.configure(text=f"Selected mod: {self.selected_mod}")

                self.mod_textbox.tag_remove("highlight", '1.0', tk.END)

                start_index = f'1.0 + {index} lines'
                end_index = f'{start_index} + 1 lines'

                self.mod_textbox.tag_add("highlight", start_index, end_index)
        except Exception as e:
            self.selected_mod = None
            self.selected_mod_label.configure(text="Selected mod: None")
            print(f"Error selecting mod: {e}")

    def install_mod(self):
        if self.yuzu_mods_dir:
            zip_file_path = filedialog.askopenfilename(filetypes=[("ZIP files", "*.zip")])
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
                    messagebox.showinfo("Success", f"Mod installed in {dest_path}.")
                    self.update_mod_list()
                except Exception as e:
                    messagebox.showerror("Error", f"Error installing mod: {e}")
                finally:
                    self.progress_bar.pack_forget()
            else:
                messagebox.showwarning("Error", "No ZIP file selected.")
        else:
            messagebox.showwarning("Error", "Please select a mods folder.")

    def uninstall_mod(self):
        if self.selected_mod and self.yuzu_mods_dir:
            mod_path = os.path.join(self.yuzu_mods_dir, self.selected_mod)
            confirmation = messagebox.askyesno("Confirmation", f"Are you sure you want to uninstall the mod '{self.selected_mod}'?")
            if confirmation:
                if os.path.exists(mod_path):
                    try:
                        shutil.rmtree(mod_path)
                        self.update_mod_list()
                        messagebox.showinfo("Success", f"Mod {self.selected_mod} uninstalled.")
                    except Exception as e:
                        messagebox.showerror("Error", f"Error removing mod: {e}")
                else:
                    self.update_mod_list()
                self.selected_mod = None
                self.selected_mod_label.configure(text="Selected mod: None")
        else:
            messagebox.showwarning("Error", "Please select a mod to uninstall.")

    def disable_mod(self):
        if self.selected_mod and self.yuzu_mods_dir:
            mod_path = os.path.join(self.yuzu_mods_dir, self.selected_mod)
            disabled_mods_dir = os.path.join(self.yuzu_mods_dir, '{disabled_mod}')
            if not os.path.exists(disabled_mods_dir):
                os.makedirs(disabled_mods_dir)
            try:
                if os.path.exists(mod_path):
                    shutil.move(mod_path, os.path.join(disabled_mods_dir, self.selected_mod))
                    self.update_mod_list()
                    messagebox.showinfo("Success", f"Mod {self.selected_mod} disabled.")
                else:
                    messagebox.showwarning("Error", f"The mod '{self.selected_mod}' does not exist.")
            except Exception as e:
                messagebox.showerror("Error", f"Error disabling mod: {e}")
        else:
            messagebox.showwarning("Error", "Please select a mod to disable.")

    def  enable_mod(self):
        if self.selected_mod and self.yuzu_mods_dir:
            disabled_mods_dir = os.path.join(self.yuzu_mods_dir, '{disabled_mod}')
            mod_path = os.path.join(disabled_mods_dir, self.selected_mod)
            if os.path.exists(mod_path):
                try:
                    shutil.move(mod_path, os.path.join(self.yuzu_mods_dir, self.selected_mod))
                    self.update_mod_list()
                    messagebox.showinfo("Success", f"Mod {self.selected_mod} enabled.")
                except Exception as e:
                    messagebox.showerror("Error", f"Error re-enabling mod: {e}")
            else:
                messagebox.showwarning("Error", f"The mod '{self.selected_mod}' does not exist in the 'disabled_mod' folder.")
        else:
            messagebox.showwarning("Error", "Please select a mod to enable.")

    def show_context_menu(self, event):
        try:
            index = int(self.mod_textbox.index('@%s,%s' % (event.x, event.y)).split('.')[0]) - 1
            mod_list = self.mod_textbox.get('1.0', tk.END).strip().split('\n')
            if 0 <= index < len(mod_list):
                self.selected_mod = mod_list[index].strip()
                self.selected_mod_label.configure(text=f"Selected mod: {self.selected_mod}")
                if self.selected_mod in [d for d in os.listdir(os.path.join(self.yuzu_mods_dir, '{disabled_mod}'))]:
                    self.context_menu.entryconfigure("Disable mod", state="disabled")
                    self.context_menu.entryconfigure("Enable mod", state="normal")
                else:
                    self.context_menu.entryconfigure("Disable mod", state="normal")
                    self.context_menu.entryconfigure("Enable mod", state="disabled")
                self.context_menu.post(event.x_root, event.y_root)
            else:
                self.selected_mod = None
        except Exception as e:
            self.selected_mod = None
            print(f"Error displaying context menu: {e}")

    def download_mod(self):
        try:
            os.system('download_en.pyw')
            self.update_mod_list()
        except Exception as e:
            messagebox.showerror("Error", f"Error downloading mod: {e}")

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

def check_first_run():
    if not os.path.exists("data/config.txt"):
        with open("data/config.txt", "w") as f:
            f.write("first=1")
        return True
    else:
        with open("data/config.txt", "r") as f:
            config = f.read().strip()
            if config == "first=1":
                return False
            else:
                with open("data/config.txt", "w") as f:
                    f.write("first=1")
                return True


def show_getting_started_window():
    # Create a new window for getting started
    getting_started_window = ctk.CTkToplevel(root)
    getting_started_window.title("Getting Started")
    getting_started_window.geometry("400x200")

    # Add some text and buttons to the window
    ctk.CTkLabel(getting_started_window, text="Welcome to the Mod Manager!").pack(pady=20)
    ctk.CTkButton(getting_started_window, text="Get Started", command=getting_started_window.destroy).pack(pady=10)

if __name__ == "__main__":
    root = ctk.CTk()
    app = ModManagerApp(root)
    root.mainloop()
