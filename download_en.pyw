import os
import requests
from zipfile import ZipFile
import patoolib
import py7zr
import shutil
from urllib.error import HTTPError
import customtkinter as ctk
import tkinter as tk
from tkinter import filedialog, messagebox
from PIL import Image

DOWNLOAD_URL = "https://raw.githubusercontent.com/FIREXDF/SSBUFightPlanner/main/img/dlmod.png"
FILE_NAME = "dlmod.png"

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

class ModManagerApp:
    def __init__(self, root):
        self.root = root
        self.root.title("Gamebanana")
        self.root.geometry("600x500")
        
        # Initialize CustomTkinter
        ctk.set_appearance_mode("System")
        ctk.set_default_color_theme("blue")
        
        self.data_folder = self.create_data_folder()
        self.mod_path = self.get_mod_path()
        
        # User interface
        self.create_widgets()

    def create_widgets(self):
        image_path = "dlmod.png"  # Remplacez par le chemin de votre image
        self.image = ctk.CTkImage(Image.open(image_path), size=(28, 32))

        # Entry for download link
        self.download_link_label = ctk.CTkLabel(self.root, text="Mod download link:")
        self.download_link_label.pack(pady=5)
        
        self.download_link_entry = ctk.CTkEntry(self.root, width=400)
        self.download_link_entry.pack(pady=5)
        
        # Button to download and install the mod
        self.download_button = ctk.CTkButton(self.root, text="Download and Install", image=self.image, command=self.download_and_install_mod)
        self.download_button.pack(pady=10)

        # Progress bar
        self.progress_bar = ctk.CTkProgressBar(self.root, mode="determinate")
        self.progress_bar.pack(pady=10, fill='x')
        self.progress_bar.pack_forget()

        # Text area for messages
        self.message_textbox = tk.Text(self.root, height=10, width=70)
        self.message_textbox.pack(pady=10)
        self.message_textbox.configure(state='disabled')
        
    def create_data_folder(self):
        script_dir = os.path.dirname(os.path.realpath(__file__))
        data_folder = os.path.join(script_dir, 'data')
        if not os.path.exists(data_folder):
            os.makedirs(data_folder)
        return data_folder

    def get_mod_path(self):
        path_file = os.path.join(self.data_folder, 'config.txt')
    
        if os.path.exists(path_file):
            with open(path_file, 'r') as f:
                lines = f.readlines()
            for line in lines:
                if line.startswith("path="):
                    mod_path = line.strip().split('=')[1]
                    if os.path.exists(mod_path):
                        return mod_path
                    else:
                        self.log_message(f"Path '{mod_path}' in {path_file} does not exist.")
                        return None
            else:
                self.log_message(f"Configuration file {path_file} does not exist.")
            return None

        
        mod_path = filedialog.askdirectory(title="Select Your 'Mods' Directory")
        if not mod_path:
            return None
        
        while not os.path.exists(mod_path):
            self.log_message("Path does not exist. Please try again.")
            mod_path = filedialog.askdirectory(title="Select Your 'Mods' Directory")
            if not mod_path:
                return None
        
        with open(path_file, 'w') as f:
            f.write(mod_path)
        
        return mod_path

    def extract_mod_and_file_id(self, download_link):
        if "https://gamebanana.com/dl/" in download_link:
            parts = download_link.split("/")[-1].split("#FileInfo_")
            if len(parts) == 2:
                return parts[0], parts[1]
        elif "https://gamebanana.com/mods/download/" in download_link:
            parts = download_link.split("/")[-1].split("#FileInfo_")
            if len(parts) == 2:
                return parts[0], parts[1]
        raise ValueError("Invalid download link format.")

    def get_filename_from_api(self, mod_id, file_id):
        api_url = f"https://gamebanana.com/apiv11/Mod/{mod_id}/DownloadPage"
        response = requests.get(api_url)
        response.raise_for_status()
        data = response.json()
        files = data['_aFiles']
        for file_info in files:
            if str(file_info["_idRow"]) == file_id:
                return file_info["_sFile"]
        raise ValueError("Filename not found for the given file ID.")

    def download_file(self, url, filename):
        self.log_message(f"\nDownloading {filename}")
        response = requests.get(url, stream=True)
        response.raise_for_status()
        total_length = response.headers.get('content-length')
        
        if total_length is None:
            raise ValueError("Unable to determine file size for download.")
        
        total_length = int(total_length)
        downloaded_size = 0
        dest = os.path.join(self.mod_path, filename)
        
        with open(dest, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                if chunk:
                    f.write(chunk)
                    downloaded_size += len(chunk)
                    self.update_progress_bar(downloaded_size, total_length)
        
        if downloaded_size != total_length:
            os.remove(dest)
            raise ValueError("Download incomplete, file removed.")
        
        self.log_message(f"\nDownloaded to {dest}")
        return dest

    def extract_archive(self, file_path):
        self.log_message(f"\nExtracting {file_path.split(os.path.sep)[-1]}")
        if file_path.endswith('.zip'):
            with ZipFile(file_path, 'r') as zip_ref:
                zip_ref.extractall(self.mod_path)
        elif file_path.endswith('.rar'):
            patoolib.extract_archive(file_path, outdir=self.mod_path)
        elif file_path.endswith('.7z'):
            with py7zr.SevenZipFile(file_path, mode='r') as seven_z_ref:
                seven_z_ref.extractall(self.mod_path)
        else:
            self.log_message(f"Unsupported archive format: {file_path}")

    def flatten_directory_structure(self):
        self.log_message(f"Flattening directory structure of {self.mod_path}")
        for root, dirs, files in os.walk(self.mod_path):
            for name in files:
                shutil.move(os.path.join(root, name), self.mod_path)
            break

    def delete_non_folders(self):
        for item in os.listdir(self.mod_path):
            item_path = os.path.join(self.mod_path, item)
            if os.path.isfile(item_path):
                self.log_message(f"Cleaning extraneous root items")
                os.remove(item_path)

    def update_progress_bar(self, downloaded_size, total_length):
        progress = downloaded_size / total_length
        self.progress_bar.set(progress)
        self.progress_bar.update_idletasks()

    def log_message(self, message):
        self.message_textbox.configure(state='normal')
        self.message_textbox.insert(tk.END, message + '\n')
        self.message_textbox.configure(state='disabled')

    def download_and_install_mod(self):
        if not self.mod_path:
            messagebox.showerror("Error", "Please select a valid mods folder.")
            return

        download_link = self.download_link_entry.get().strip()
        
        try:
            mod_id, file_id = self.extract_mod_and_file_id(download_link)
            filename = self.get_filename_from_api(mod_id, file_id)
            download_url = f"https://gamebanana.com/dl/{file_id}"
            
            dest = self.download_file(download_url, filename)
            self.extract_archive(dest)
            os.remove(dest)
            self.delete_non_folders()
            self.flatten_directory_structure()
            self.log_message("\nMod downloaded and extracted successfully")
        except ValueError as e:
            self.log_message(str(e))
        except HTTPError:
            self.log_message("HTTP error encountered, please try again later.")

if __name__ == "__main__":
    root = ctk.CTk()
    app = ModManagerApp(root)
    root.mainloop()
