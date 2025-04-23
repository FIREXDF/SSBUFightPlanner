// yoinked both functions from here: https://stackoverflow.com/questions/18638900/javascript-crc32
var makeCRCTable = function() {
    var c;
    var crcTable = [];
    for (var n = 0; n < 256; n++) {
        c = n;
        for (var k = 0; k < 8; k++) {
            c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
        }
        crcTable[n] = c;
    }
    return crcTable;
}

var crc32 = function(str) {
    var crc = 0 ^ (-1);

    for (var i = 0; i < str.length; i++) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ str.charCodeAt(i)) & 0xFF];
    }

    return (crc ^ (-1)) >>> 0;
};

var crcTable = makeCRCTable();

function get_hash40_of_str(str) {
    return Number(BigInt(str.length) << BigInt(32)) + crc32(str);
}



// Modules to control application life and create native browser window
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec, execSync } = require("child_process");
const fs = require('fs');
const ProgressBar = require('electron-progressbar');
const { dialog } = require('electron')

function msbt_conversion(input_path, output_path) {
    execSync(`dotnet "resources/tools/MSBTEditorCLI/MSBTEditorCLI.dll" "${input_path}" "${output_path}"`, (error, stdout, stderr) => {
        if (error) {
            console.log(`Error: ${error.message}`);
            return;
        }
        if (stderr) {
            console.log(`Standard Error: ${stderr}`);
            return;
        }
        console.log(`Standard Output: ${stdout}`);
    });
}

function prc_to_json(input_path, output_path) {
    execSync(`dotnet "resources/tools/prc2json/prc2json.dll" -d "${input_path}" -o "${output_path}" -l "resources/tools/prc2json/ParamLabels.csv"`, (error, stdout, stderr) => {
        if (error) {
            console.log(`Error: ${error.message}`);
            return;
        }
        if (stderr) {
            console.log(`Standard Error: ${stderr}`);
            return;
        }
        console.log(`Standard Output: ${stdout}`);
    });
}

function json_to_prc(input_path, output_path) {
    execSync(`dotnet "resources/tools/prc2json/prc2json.dll" -a "${input_path}" -o "${output_path}" -l "resources/tools/prc2json/ParamLabels.csv"`, (error, stdout, stderr) => {
        if (error) {
            console.log(`Error: ${error.message}`);
            return;
        }
        if (stderr) {
            console.log(`Standard Error: ${stderr}`);
            return;
        }
        console.log(`Standard Output: ${stdout}`);
    });
}

function setup_files() {
    var progressBar = new ProgressBar({
        text: 'Parsing data...',
        detail: 'Parsing data...'
    });

    progressBar
        .on('completed', function() {
            progressBar.detail = 'Finished opening!';
            return;
        })
        .on('aborted', function() {
            console.info(`aborted...`);
        });

    try {
        fs.mkdirSync("./resources/data");
    } catch (error) {
        //
    }

    msbt_conversion("./resources/files/ui/message/msg_name.msbt", "./resources/data/msg_name.json");
    prc_to_json("./resources/files/ui/param/database/ui_chara_db.prc", "./resources/data/ui_chara_db.json");
    prc_to_json("./resources/files/ui/param/database/ui_layout_db.prc", "./resources/data/ui_layout_db.json");
    progressBar.setCompleted();
}

function backup_files() {
    try {
        fs.mkdirSync("./resources/backup");
    } catch (error) {
        // 
    }

    fs.copyFileSync("./resources/files/ui/message/msg_name.msbt", "./resources/backup/msg_name.msbt");
    fs.copyFileSync("./resources/files/ui/param/database/ui_chara_db.prc", "./resources/backup/ui_chara_db.prc");
    fs.copyFileSync("./resources/files/ui/param/database/ui_layout_db.prc", "./resources/backup/ui_layout_db.prc");
}

function get_values(object, key, arr) {
    Object.keys(object).some(function(k) {
        if (k === key) {
            arr.push(object[k]);
        }
        if (object[k] && typeof object[k] === 'object') {
            get_values(object[k], key, arr);
        }
    });
}

function get_all_hashes(data) {
    var keys = [];
    get_values(data, "@hash", keys);

    var hash40_fields = [];
    get_values(data, "hash40", hash40_fields);

    var values = [];

    for (var i = 0; i < hash40_fields.length; i++) {
        for (var y = 0; y < hash40_fields[i].length; y++) {
            let text = hash40_fields[i][y]["#text"].trim();
            if (text != "" && !text.startsWith("0x")) {
                values.push(text);
            }
        }
    }

    res = [...new Set(keys)]
    res.push(...[...new Set(values)])
    return res;
}

function dotnet_exists() {
    var commandExistsSync = require('command-exists').sync;
    return commandExistsSync('dotnet');
}

function required_files_exist() {
    return !(!fs.existsSync("./resources/files/ui/param/database/ui_chara_db.prc") ||
        !fs.existsSync("./resources/files/ui/param/database/ui_layout_db.prc") ||
        !fs.existsSync("./resources/files/ui/message/msg_name.msbt"));
}

function labels_exist() {
    return fs.existsSync("./resources/tools/prc2json/ParamLabels.csv");
}

async function createWindow() {

    if (!labels_exist()) {
        let res = dialog.showMessageBoxSync(BrowserWindow.getFocusedWindow(), {
            type: 'question',
            buttons: ['&Yes', '&No'],
            title: "Download ParamLabels.csv",
            normalizeAccessKeys: true,
            message: 'ParamLabels.csv could not be found! Would you like to download it from the github repo? (will be downloaded to ./resources/tools/prc2json/ParamLabels.csv)'
        });
        if (res == 0) {
            const download = require('download');
            await download("http://raw.githubusercontent.com/ultimate-research/param-labels/master/ParamLabels.csv", "./resources/tools/prc2json")
                .then(() => {
                    console.log('Download Completed');
                });
        }
    }

    if (!labels_exist()) {
        dialog.showErrorBox("Missing Lables!", "Please make sure you have ParamLabels.csv in ./resources/tools/prc2json");
        app.exit(0);
    }

    if (!dotnet_exists()) {
        dialog.showErrorBox("Missing Program!", "Please make sure you have dotnet v4.0.30319 or higher installed and added to PATH!");
        app.exit(0);
    }

    if (!required_files_exist()) {
        dialog.showErrorBox("Missing Files!", "Please make sure ui_chara_db.prc, ui_layout_db.prc, and msg_name.msbt is in the `./resources/files/<arc path>` folder!");
        app.exit(0);
    }

    // Setup files
    setup_files();

    ipcMain.on("open_save_dir", (event) => {
        exec('start "" ".\\resources\\files"');
    });

    ipcMain.on("loadJSON", (event, path) => {
        event.returnValue = fs.readFileSync(path, 'utf8');
    });

    ipcMain.on("save", (event, result) => {
        var progressBar = new ProgressBar({
            text: 'Parsing data...',
            detail: 'Parsing data...'
        });

        progressBar
            .on('completed', function() {
                progressBar.detail = 'Finished saving!';
                return;
            })
            .on('aborted', function() {
                console.info(`aborted...`);
            });

        progressBar.detail = "Backing up files...";
        backup_files();

        result = JSON.parse(result);

        //#region Get all hashes from the database files and store them in ParamLabels.csv
        progressBar.detail = `Getting all hashes from ui_chara_db & ui_layout_db...`;
        new_param_hashes = get_all_hashes(result["ui_chara_json"]);
        new_param_hashes.push(...get_all_hashes(result["ui_layout_json"]));

        progressBar.detail = `Reading ParamLabels.csv...`;
        var param_labels_text = fs.readFileSync("./resources/tools/prc2json/ParamLabels.csv", 'utf8');

        progressBar.detail = `Parsing ParamLabels.csv...`;
        param_labels_text = param_labels_text.split("\r\n");

        var param_labels = {};
        for (var i = 0; i < param_labels_text.length; i++) {
            let res = param_labels_text[i].split(",");
            let hash = res[0].trim();
            let value = res[1].trim();
            param_labels[hash] = value;
        }

        progressBar.detail = `Adding new hashes...`;
        for (var i = 0; i < new_param_hashes.length; i++) {
            let hash = `0x${get_hash40_of_str(new_param_hashes[i]).toString(16)}`;
            if (!(hash in param_labels)) {
                param_labels[hash] = new_param_hashes[i];
            }
        }

        progressBar.detail = `Rebuilding ParamLabels.csv...`;
        var res_param_labels = [];

        for (var key in param_labels) {
            if (param_labels.hasOwnProperty(key)) {
                res_param_labels.push(`${key},${param_labels[key]}`);
            }
        }

        progressBar.detail = `Saving ParamLabels.csv...`;
        fs.writeFileSync("./resources/tools/prc2json/ParamLabels.csv", res_param_labels.join("\r\n"));
        progressBar.detail = `Finished dealing with ParamLabels.csv!`;
        //#endregion

        //#region Write result to files in data
        progressBar.detail = `Storing msg_name to data file...`;
        fs.writeFileSync("./resources/data/msg_name.json", JSON.stringify(result["msg_name_json"]), function(err) {
            if (err) {
                console.log(err);
                return err;
            }
            console.log("done");
        });
        progressBar.detail = `Storing ui_chara_db to data file...`;
        fs.writeFileSync("./resources/data/ui_chara_db.json", JSON.stringify(result["ui_chara_json"]), function(err) {
            if (err) {
                console.log(err);
                return err;
            }
            console.log("done");
        });
        progressBar.detail = `Storing ui_layout_db to data file...`;
        fs.writeFileSync("./resources/data/ui_layout_db.json", JSON.stringify(result["ui_layout_json"]), function(err) {
            if (err) {
                console.log(err);
                return err;
            }
            console.log("done");
        });
        //#endregion

        //#region Convert files in data back to the original format
        progressBar.detail = `Converting ui_chara_db to prc file...`;
        json_to_prc("./resources/data/ui_chara_db.json", "./resources/files/ui/param/database/ui_chara_db.prc");
        progressBar.detail = `Converting ui_layout_db to prc file...`;
        json_to_prc("./resources/data/ui_layout_db.json", "./resources/files/ui/param/database/ui_layout_db.prc");
        progressBar.detail = `Converting msg_name to MSBT file...`;
        msbt_conversion("./resources/data/msg_name.json", "./resources/files/ui/message/msg_name.msbt");
        //#endregion
        progressBar.setCompleted();
    });

    // Create the browser window.
    const mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
        }
    });

    mainWindow.setTitle("Smash Ultimate - CSS Manager");



    // and load the index.html of the app.
    mainWindow.loadFile('index.html')

    // Open the DevTools.
    // mainWindow.webContents.openDevTools()

    // From https://github.com/konsumer/electron-prompt/blob/master/main.js
    var promptResponse
    ipcMain.on('prompt', function(eventRet, arg) {
        promptResponse = null
        var promptWindow = new BrowserWindow({
            width: 200,
            height: 100,
            show: false,
            resizable: false,
            movable: false,
            alwaysOnTop: true,
            frame: false,
            webPreferences: {
                nodeIntegration: true,
                contextIsolation: false,
            }
        })
        arg.val = arg.val || ''
        const promptHtml = '<label for="val">' + arg.title + '</label>\
      <input id="val" value="' + arg.val + '" autofocus />\
      <button onclick="require(\'electron\').ipcRenderer.send(\'prompt-response\', document.getElementById(\'val\').value);window.close()">Ok</button>\
      <button onclick="window.close()">Cancel</button>\
      <style>body {font-family: sans-serif;} button {float:right; margin-left: 10px;} label,input {margin-bottom: 10px; width: 100%; display:block;}</style>'
        promptWindow.loadURL('data:text/html,' + promptHtml)
        promptWindow.show()
        promptWindow.on('closed', function() {
            eventRet.returnValue = promptResponse
            promptWindow = null
        });
    })
    ipcMain.on('prompt-response', function(event, arg) {
        if (arg === '') { arg = null }
        promptResponse = arg
    })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
    createWindow()

    app.on('activate', function() {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', function() {
    if (process.platform !== 'darwin') app.quit()
})