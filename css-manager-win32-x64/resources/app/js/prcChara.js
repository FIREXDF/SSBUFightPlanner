var chara_data = [];
var layout_data = [];
var original_msbt_data = {};
var msbt_data = {};
var found_labels = [];

var chara_context_menu = document.getElementById("context-menu-controller");
var prc_data_context = document.getElementById("prc-data-context");
var msbt_edit_context = document.getElementById("msbt-edit-context");

var current_selected_index = 0;
var chara_ids = [];
var fighter_types = [];

function show_msbt_context() {
    prc_data_context.style.display = "none";
    from_scratch_msbt_context();
    msbt_edit_context.style.display = "block";
}

function show_prc_context() {
    prc_data_context.style.display = "block";
    msbt_edit_context.style.display = "none";
}

function load_custom_json(json) {

}

function export_custom_json(json) {

}

function add_entry() {

}

window.onload = function() {
    var radios = document.getElementsByName("css_style_1");

    document.getElementById("save").addEventListener("click", () => {

        var display_characters = document.getElementById("non_hidden").children;
        var hidden_characters = document.getElementById("hidden").children;
        var i = 0;

        // TODO: Update this to use the find index function
        for (let chara of display_characters) {
            chara_data.struct.list.struct[chara.id].sbyte[2]["#text"] = i;
            chara_data.struct.list.struct[chara.id].sbyte[1]["#text"] = i;

            let can_select_index = get_index_of_hash(chara_data.struct.list.struct[chara.id].bool, "can_select");
            if (chara_data.struct.list.struct[chara.id].string["#text"] == "random") {
                chara_data.struct.list.struct[chara.id].bool[can_select_index]["#text"] = "False";
            } else {
                chara_data.struct.list.struct[chara.id].bool[can_select_index]["#text"] = "True";
            }
            if (i < 127) {
                i++;
            }
        }

        for (let chara of hidden_characters) {
            chara_data.struct.list.struct[chara.id].sbyte[2]["#text"] = -1;
            chara_data.struct.list.struct[chara.id].bool[3]["#text"] = "False";
        }

        var res_data = [];
        for (let chara of display_characters) {
            res_data.push(chara_data.struct.list.struct[chara.id]);
        }
        for (let chara of hidden_characters) {
            res_data.push(chara_data.struct.list.struct[chara.id]);
        }
        chara_data.struct.list.struct = res_data;
        for (var i = 0; i < original_msbt_data["strings"].length; i++) {
            original_msbt_data["strings"][i]["value"] = msbt_data[original_msbt_data["strings"][i]["label"]].replace(/\r\n/g, "\r\r\n");
        }

        original_msbt_data["added_labels"] = {};

        for (var label in msbt_data) {
            if (msbt_data.hasOwnProperty(label)) {
                if (!found_labels.includes(label)) {
                    original_msbt_data["added_labels"][label] = msbt_data[label].replace(/\r\n/g, "\r\r\n");
                }
            }
        }

        var _req = JSON.stringify({
            "ui_chara_json": chara_data,
            "ui_layout_json": layout_data,
            "msg_name_json": original_msbt_data,
        });

        setupCSS()
        window.electronAPI.save(_req);
    });

    document.getElementById("duplicate").addEventListener("click", () => {
        let og_ui_chara_id = chara_data.struct.list.struct[current_selected_index]["hash40"][get_index_of_hash(chara_data.struct.list.struct[current_selected_index]["hash40"], "ui_chara_id")]["#text"];
        let og_name_id = chara_data.struct.list.struct[current_selected_index]["string"]["#text"];

        let result = JSON.parse(JSON.stringify(chara_data.struct.list.struct[current_selected_index]));

        let new_ui_chara_id = window.electronAPI.prompt("Enter the new ui_chara_id").trim();

        if (new_ui_chara_id == "" || !new_ui_chara_id.startsWith("ui_chara_")) {
            alert("The new ui_chara_id must start with ui_chara_ and not be nothing!");
            return;
        }

        result["hash40"][get_index_of_hash(result["hash40"], "ui_chara_id")]["#text"] = new_ui_chara_id;

        if (window.confirm("Would you like to duplicate the ui_layout_db entry?")) {
            let ui_layout_targets = [];

            for (var i = 0; i < layout_data.struct.list.struct.length; i++) {
                if (layout_data.struct.list.struct[i]["hash40"][get_index_of_hash(layout_data.struct.list.struct[i]["hash40"], "ui_chara_id")]["#text"] == og_ui_chara_id) {
                    ui_layout_targets.push(JSON.parse(JSON.stringify(layout_data.struct.list.struct[i])))
                }
            }

            for (var i = 0; i < ui_layout_targets.length; i++) {
                ui_layout_targets[i]["hash40"][get_index_of_hash(ui_layout_targets[i]["hash40"], "ui_chara_id")]["#text"] = new_ui_chara_id;
                ui_layout_targets[i]["hash40"][get_index_of_hash(ui_layout_targets[i]["hash40"], "ui_layout_id")]["#text"] = ui_layout_targets[i]["hash40"][get_index_of_hash(ui_layout_targets[i]["hash40"], "ui_layout_id")]["#text"].replace(og_ui_chara_id, new_ui_chara_id);
                layout_data.struct.list.struct.push(ui_layout_targets[i]);
            }
        }

        if (window.confirm("Would you like to copy every instance of the name_id to a new name_id?")) {
            let new_name_id = window.electronAPI.prompt("Enter the new name_id").trim();

            while (new_name_id == "") {
                alert("The new name_id cannot be empty!");
                new_name_id = window.electronAPI.prompt("Enter the new name_id").trim();
            }

            for (var key in msbt_data) {
                if (msbt_data.hasOwnProperty(key)) {
                    if (key.endsWith(`_${og_name_id}`) || key.includes(`_${og_name_id}_`)) {
                        let new_lbl = key.replace(og_name_id, new_name_id);
                        msbt_data[new_lbl] = msbt_data[key];
                    }
                }
            }

            result["string"]["#text"] = new_name_id;
        }

        result["bool"][get_index_of_hash(result["bool"], "is_dlc")]["#text"] = "False";
        result["bool"][get_index_of_hash(result["bool"], "is_patch")]["#text"] = "False";
        result["hash40"].push({
            "@hash": "original_ui_chara_hash",
            "#text": og_ui_chara_id
        });

        chara_data.struct.list.struct.push(result);
        setupCSS();
    });

    document.getElementById("remove").addEventListener("click", () => {
        chara_data.struct.list.struct.splice(current_selected_index, 1);
        setupCSS();
    });

    document.getElementById("refresh").addEventListener("click", () => {
        setupCSS();
    });

    document.getElementById("osd").addEventListener("click", () => {
        window.electronAPI.openSaveDir();
    });

    document.getElementById("toggle").addEventListener("click", () => {
        if (prc_data_context.style.display == "block") {
            show_msbt_context();
        } else {
            show_prc_context();
        }
    });

    // Load data
    layout_data = JSON.parse(window.electronAPI.loadJSON("./resources/data/ui_layout_db.json"));
    chara_data = JSON.parse(window.electronAPI.loadJSON("./resources/data/ui_chara_db.json"));
    original_msbt_data = JSON.parse(window.electronAPI.loadJSON("./resources/data/msg_name.json"));
    for (var i = 0; i < original_msbt_data["strings"].length; i++) {
        found_labels.push(original_msbt_data["strings"][i]["label"]);
        msbt_data[original_msbt_data["strings"][i]["label"]] = original_msbt_data["strings"][i]["value"].replace(/\r\r\n/g, "\r\n");
    }

    for (radio in radios) {
        radios[radio].onclick = function() {
            var element = document.getElementById("non_hidden");
            if (this.value == "flex") {
                element.classList.remove("list-grid");
                element.classList.add("list-flex");
            } else {
                element.classList.remove("list-flex");
                element.classList.add("list-grid");
            }
        }
    }

    var radios = document.getElementsByName("css_style_2");

    for (radio in radios) {
        radios[radio].onclick = function() {
            var element = document.getElementById("hidden");
            if (this.value == "flex") {
                element.classList.remove("list-grid");
                element.classList.add("list-flex");
            } else {
                element.classList.remove("list-flex");
                element.classList.add("list-grid");
            }
        }
    }

    document.getElementById("css_style_1_flex").click();
    document.getElementById("css_style_2_flex").click();

    setup();
    setupCSS();
}

function get_index_of_hash(data, hash) {
    if (!Array.isArray(data)) {
        return -1;
    }

    for (var i = 0; i < data.length; i++) {
        if (data[i]["@hash"] == hash) {
            return i;
        }
    }

    return -1;

}

function TranslateName(name) {
    let key = `nam_chr1_00_${name}`;
    if (key in msbt_data) {
        return msbt_data[key];
    } else {
        return "";
    }
}

function setupCSS() {
    chara_context_menu.style.display = "none";
    var randomId = 0;
    var randomElement;
    chara_ids = [];
    fighter_types = [];

    $("#non_hidden").html("");
    $("#hidden").html("");

    chara_data.struct.list.struct.forEach(function(item, index) {
        var node = document.createElement("div");
        var mainImageNode = document.createElement("div");
        var imageNode = document.createElement("div");
        var name = document.createElement("p");

        var chara_name = item.string["#text"];

        name.innerHTML = TranslateName(chara_name).toUpperCase();
        name.setAttribute("class", "chara_name");

        node.setAttribute("class", "item");
        node.setAttribute("id", index);
        node.setAttribute("data-disp_order", item.sbyte[2]["#text"]);

        mainImageNode.setAttribute("class", "image");

        imageNode.setAttribute("class", "chara_icon");
        imageNode.setAttribute("style", `background-image: url("./img/chara_7_${chara_name}_00.png");`);

        mainImageNode.appendChild(imageNode);

        node.appendChild(mainImageNode);
        node.appendChild(name);

        node.addEventListener("contextmenu", function(e) {
            moveElement(node);
            return false;
        });

        node.addEventListener("click", function(e) {
            showCustomContextMenu(node, e);
            return false;
        });

        if (chara_name == "random") {
            node.classList.add("disabled");
            randomId = index;
            randomElement = node;
        }

        if (item.sbyte[2]["#text"] == -1) {
            document.getElementById("hidden").appendChild(node);
        } else {
            document.getElementById("non_hidden").appendChild(node);
        }

        chara_ids.push(item["hash40"][0]["#text"]);
        if (!fighter_types.includes(item["hash40"][4]["#text"])) {
            fighter_types.push(item["hash40"][4]["#text"]);
        }
    });


    /*
     * Thanks to CertainPerformance for this snippet of code.
     * https://stackoverflow.com/questions/53713114/order-divs-by-id-in-javascript
     */
    const main = document.querySelector('#non_hidden');
    const divs = [...main.children];
    divs.sort((a, b) => a.getAttribute("data-disp_order") - b.getAttribute("data-disp_order"));
    divs.forEach(div => main.appendChild(div));


    var sorted = sortable('.sortable', {
        acceptFrom: '.list-grid, .list-flex', // Defaults to null
        hoverClass: 'item-hover',
    })

    for (var i = 0; i < sorted.length; i++) {
        sorted[i].addEventListener('sortstart', function(e) {
            chara_context_menu.style.display = "none";
        });
    }

    document.getElementById("echo_fighters").innerHTML = "<option value=\"-1\">None</option>";
    document.getElementById("fighter_types").innerHTML = "";

    for (var i = 0; i < chara_ids.length; i++) {
        document.getElementById("echo_fighters").innerHTML += `<option value="${chara_ids[i]}">${chara_ids[i]}</option>`;
    }

    for (var i = 0; i < fighter_types.length; i++) {
        document.getElementById("fighter_types").innerHTML += `<option value="${fighter_types[i]}">${fighter_types[i]}</option>`;
    }
}

function moveElement(element) {
    chara_context_menu.style.display = "none";
    var id = element.parentNode.id;
    if (id == "non_hidden") {
        $(element).appendTo("#hidden");
    } else {
        $(element).appendTo("#non_hidden");
    }
}

function showCustomContextMenu(element, e) {
    show_prc_context();
    var chara_index = element.id;
    current_selected_index = chara_index;
    var char_info = chara_data.struct.list.struct[current_selected_index];

    //#region Display Character Context Menu
    var bodyRect = document.body.getBoundingClientRect(),
        elemRect = element.getBoundingClientRect(),
        offset = elemRect.top - bodyRect.top;
    console.log(offset);

    chara_context_menu.style.display = "none";

    chara_context_menu.style.left = `${elemRect.left + element.offsetWidth + 5}px`;
    chara_context_menu.style.top = `${offset - 110}px`;
    chara_context_menu.style.display = "block";
    //#endregion

    //#region Setup Character Context Menu
    document.getElementById("chara_name").innerHTML = TranslateName(char_info.string["#text"]);
    document.getElementById("ui_chara_id").value = char_info["hash40"][get_index_of_hash(char_info["hash40"], "ui_chara_id")]["#text"];
    document.getElementById("ui_series_id").value = char_info["hash40"][get_index_of_hash(char_info["hash40"], "ui_series_id")]["#text"];
    document.getElementById("fighter_kind").value = char_info["hash40"][get_index_of_hash(char_info["hash40"], "fighter_kind")]["#text"];
    document.getElementById("fighter_kind_corps").value = char_info["hash40"][get_index_of_hash(char_info["hash40"], "fighter_kind_corps")]["#text"];
    document.getElementById("name_id").value = char_info["string"]["#text"];
    document.getElementById("echo_fighters").value = char_info["hash40"][get_index_of_hash(char_info["hash40"], "alt_chara_id")]["#text"];
    document.getElementById("fighter_types").value = char_info["hash40"][get_index_of_hash(char_info["hash40"], "fighter_type")]["#text"];
    document.getElementById("exhibit_year").value = char_info["short"]["#text"];
    document.getElementById("amount_of_colors").value = char_info["byte"][get_index_of_hash(char_info["byte"], "color_num")]["#text"];

    if (get_index_of_hash(char_info["byte"], "color_start_index") == -1) {
        char_info["byte"].push({
            "@hash": "color_start_index",
            "#text": "0"
        });
    }

    document.getElementById("color_start_index").value = char_info["byte"][get_index_of_hash(char_info["byte"], "color_start_index")]["#text"];
    document.getElementById("can_select").checked = char_info["bool"][get_index_of_hash(char_info["bool"], "can_select")]["#text"] == "True" ? true : false;
    document.getElementById("is_mii").checked = char_info["bool"][get_index_of_hash(char_info["bool"], "is_mii")]["#text"] == "True" ? true : false;
    document.getElementById("is_boss").checked = char_info["bool"][get_index_of_hash(char_info["bool"], "is_boss")]["#text"] == "True" ? true : false;
    document.getElementById("is_hidden_boss").checked = char_info["bool"][get_index_of_hash(char_info["bool"], "is_hidden_boss")]["#text"] == "True" ? true : false;


    //#region MSBT Context Setup
    from_scratch_msbt_context();
    //#endregion

    //#endregion

}

function from_scratch_msbt_context() {
    document.getElementById("current_name_id").innerHTML = chara_data.struct.list.struct[current_selected_index]["string"]["#text"];
    $("#selected_slot").html("");
    for (var i = 0; i < chara_data.struct.list.struct[current_selected_index]["byte"][get_index_of_hash(chara_data.struct.list.struct[current_selected_index]["byte"], "color_num")]["#text"]; i++) {
        document.getElementById("selected_slot").innerHTML += `<option value="${i}">${i + 1}</option>`;
    }

    document.getElementById("cxx_index").value = chara_data.struct.list.struct[current_selected_index]["byte"][get_index_of_hash(chara_data.struct.list.struct[current_selected_index]["byte"], `c${$("#selected_slot").val().padStart(2, '0')}_index`)]["#text"];
    document.getElementById("nxx_index").value = chara_data.struct.list.struct[current_selected_index]["byte"][get_index_of_hash(chara_data.struct.list.struct[current_selected_index]["byte"], `n${$("#selected_slot").val().padStart(2, '0')}_index`)]["#text"];

    setup_msbt_context();
}

function setup_msbt_context() {
    let characall_label_key = `characall_label_c${$("#nxx_index").val().padStart(2, '0')}`;
    let characall_index = get_index_of_hash(chara_data.struct.list.struct[current_selected_index]["hash40"], characall_label_key);

    if (characall_index == -1) {
        document.getElementById("characall_label").value = "";
    } else {
        document.getElementById("characall_label").value = chara_data.struct.list.struct[current_selected_index]["hash40"][characall_index]["#text"];
    }

    let index_and_name_id = `${$("#nxx_index").val().padStart(2, '0')}_${chara_data.struct.list.struct[current_selected_index]["string"]["#text"]}`;
    let nam_chr0_key = `nam_chr0_${index_and_name_id}`;

    if (nam_chr0_key in msbt_data) {
        document.getElementById("nam_chr0").value = msbt_data[nam_chr0_key];
    } else {
        document.getElementById("nam_chr0").value = "";
    }

    let nam_chr1_key = `nam_chr1_${index_and_name_id}`;

    if (nam_chr1_key in msbt_data) {
        document.getElementById("nam_chr1").value = msbt_data[nam_chr1_key];
    } else {
        document.getElementById("nam_chr1").value = "";
    }

    let nam_chr2_key = `nam_chr2_${index_and_name_id}`;

    if (nam_chr2_key in msbt_data) {
        document.getElementById("nam_chr2").value = msbt_data[nam_chr2_key];
    } else {
        document.getElementById("nam_chr2").value = "";
    }

    let nam_chr3_key = `nam_chr3_${index_and_name_id}`;

    if (nam_chr3_key in msbt_data) {
        document.getElementById("nam_chr3").value = msbt_data[nam_chr3_key];
    } else {
        document.getElementById("nam_chr3").value = "";
    }

    let nam_stage_name_key = `nam_stage_name_${index_and_name_id}`;

    if (nam_stage_name_key in msbt_data) {
        document.getElementById("nam_stage_name").value = msbt_data[nam_stage_name_key];
    } else {
        document.getElementById("nam_stage_name").value = "";
    }
}

function setup() {
    window.addEventListener("click", function(e) {
        var hide_menu = true;
        for (var i = 0; i < e.path.length; i++) {
            if (e.path[i].classList != undefined) {
                if (e.path[i].classList.contains("item")) {
                    hide_menu = false;
                } else if (e.path[i].id == "context-menu-controller") {
                    hide_menu = false;
                }
            }
        }
        if (hide_menu) {
            chara_context_menu.style.display = "none";
        }
    })

    //#region Setup Character Context Menu Listeners
    document.getElementById("ui_chara_id").addEventListener("input", function(e) {
        chara_data.struct.list.struct[current_selected_index]["hash40"][get_index_of_hash(chara_data.struct.list.struct[current_selected_index]["hash40"], "ui_chara_id")]["#text"] = this.value;
    });

    document.getElementById("ui_series_id").addEventListener("input", function(e) {
        chara_data.struct.list.struct[current_selected_index]["hash40"][get_index_of_hash(chara_data.struct.list.struct[current_selected_index]["hash40"], "ui_series_id")]["#text"] = this.value;
    });

    document.getElementById("fighter_kind").addEventListener("input", function(e) {
        chara_data.struct.list.struct[current_selected_index]["hash40"][get_index_of_hash(chara_data.struct.list.struct[current_selected_index]["hash40"], "fighter_kind")]["#text"] = this.value;
    });

    document.getElementById("fighter_kind_corps").addEventListener("input", function(e) {
        chara_data.struct.list.struct[current_selected_index]["hash40"][get_index_of_hash(chara_data.struct.list.struct[current_selected_index]["hash40"], "fighter_kind_corps")]["#text"] = this.value;
    });

    document.getElementById("name_id").addEventListener("change", function(e) {
        chara_data.struct.list.struct[current_selected_index]["string"]["#text"] = this.value;
    });

    document.getElementById("echo_fighters").addEventListener("change", function(e) {
        chara_data.struct.list.struct[current_selected_index]["hash40"][get_index_of_hash(chara_data.struct.list.struct[current_selected_index]["hash40"], "alt_chara_id")]["#text"] = this.value;
    });

    document.getElementById("fighter_types").addEventListener("change", function(e) {
        chara_data.struct.list.struct[current_selected_index]["hash40"][get_index_of_hash(chara_data.struct.list.struct[current_selected_index]["hash40"], "fighter_type")]["#text"] = this.value;
    });

    document.getElementById("exhibit_year").addEventListener("input", function(e) {
        chara_data.struct.list.struct[current_selected_index]["short"]["#text"] = this.value;
    });

    document.getElementById("amount_of_colors").addEventListener("input", function(e) {
        chara_data.struct.list.struct[current_selected_index]["byte"][get_index_of_hash(chara_data.struct.list.struct[current_selected_index]["byte"], "color_num")]["#text"] = this.value;
    });

    document.getElementById("color_start_index").addEventListener("input", function(e) {
        chara_data.struct.list.struct[current_selected_index]["byte"][get_index_of_hash(chara_data.struct.list.struct[current_selected_index]["byte"], "color_start_index")]["#text"] = this.value;
    });

    document.getElementById("can_select").addEventListener("change", function(e) {
        chara_data.struct.list.struct[current_selected_index]["bool"][get_index_of_hash(chara_data.struct.list.struct[current_selected_index]["bool"], "can_select")]["#text"] = this.checked == true ? "True" : "False";
    });

    document.getElementById("is_mii").addEventListener("change", function(e) {
        chara_data.struct.list.struct[current_selected_index]["bool"][get_index_of_hash(chara_data.struct.list.struct[current_selected_index]["bool"], "is_mii")]["#text"] = this.checked == true ? "True" : "False";
    });

    document.getElementById("is_boss").addEventListener("change", function(e) {
        chara_data.struct.list.struct[current_selected_index]["bool"][get_index_of_hash(chara_data.struct.list.struct[current_selected_index]["bool"], "is_boss")]["#text"] = this.checked == true ? "True" : "False";
    });

    document.getElementById("is_hidden_boss").addEventListener("change", function(e) {
        chara_data.struct.list.struct[current_selected_index]["bool"][get_index_of_hash(chara_data.struct.list.struct[current_selected_index]["bool"], "is_hidden_boss")]["#text"] = this.checked == true ? "True" : "False";
    });

    //#region MSBT Context Listeners

    document.getElementById("selected_slot").addEventListener("change", () => {
        let nXX_key = `n${$("#selected_slot").val().padStart(2, '0')}_index`;
        let nXX_index = get_index_of_hash(chara_data.struct.list.struct[current_selected_index]["byte"], nXX_key);

        if (nXX_index == -1) {
            $("#nxx_index").val("0");
        } else {
            $("#nxx_index").val(chara_data.struct.list.struct[current_selected_index]["byte"][nXX_index]["#text"]);
        }

        let cXX_key = `c${$("#selected_slot").val().padStart(2, '0')}_index`;
        let cXX_index = get_index_of_hash(chara_data.struct.list.struct[current_selected_index]["byte"], cXX_key);

        if (cXX_index == -1) {
            $("#cxx_index").val("0");
        } else {
            $("#cxx_index").val(chara_data.struct.list.struct[current_selected_index]["byte"][cXX_index]["#text"]);
        }

        setup_msbt_context();
    });

    document.getElementById("nxx_index").addEventListener("change", () => {
        let nXX_key = `n${$("#selected_slot").val().padStart(2, '0')}_index`;
        let nXX_index = get_index_of_hash(chara_data.struct.list.struct[current_selected_index]["byte"], nXX_key);

        if (nXX_index == -1) {
            chara_data.struct.list.struct[current_selected_index]["byte"].push({
                "@hash": nXX_key,
                "#text": $("#nxx_index").val()
            });
        } else {
            chara_data.struct.list.struct[current_selected_index]["byte"][nXX_index]["#text"] = $("#nxx_index").val();
        }

        setup_msbt_context();
    });

    document.getElementById("cxx_index").addEventListener("change", () => {
        let cXX_key = `c${$("#selected_slot").val().padStart(2, '0')}_index`;
        let cXX_index = get_index_of_hash(chara_data.struct.list.struct[current_selected_index]["byte"], cXX_key);

        if (cXX_index == -1) {
            chara_data.struct.list.struct[current_selected_index]["byte"].push({
                "@hash": cXX_key,
                "#text": $("#cxx_index").val()
            });
        } else {
            chara_data.struct.list.struct[current_selected_index]["byte"][cXX_index]["#text"] = $("#cxx_index").val();
        }

        setup_msbt_context();
    });

    document.getElementById("characall_label").addEventListener("change", () => {
        let characall_label_key = `characall_label_c${$("#nxx_index").val().padStart(2, '0')}`;
        let characall_index = get_index_of_hash(chara_data.struct.list.struct[current_selected_index]["hash40"], characall_label_key);

        if (characall_index == -1) {
            chara_data.struct.list.struct[current_selected_index]["hash40"].push({
                "@hash": characall_label_key,
                "#text": $("#characall_label").val().trim()
            });
        } else {
            chara_data.struct.list.struct[current_selected_index]["hash40"][characall_index]["#text"] = $("#characall_label").val();
        }

    });

    document.getElementById("nam_chr0").addEventListener("change", () => {
        let slot_and_name_id = `${$("#nxx_index").val().padStart(2, '0')}_${chara_data.struct.list.struct[current_selected_index]["string"]["#text"]}`;
        let nam_chr0_key = `nam_chr0_${slot_and_name_id}`;
        msbt_data[nam_chr0_key] = $("#nam_chr0").val();
    });

    document.getElementById("nam_chr1").addEventListener("change", () => {
        let slot_and_name_id = `${$("#nxx_index").val().padStart(2, '0')}_${chara_data.struct.list.struct[current_selected_index]["string"]["#text"]}`;
        let nam_chr1_key = `nam_chr1_${slot_and_name_id}`;
        msbt_data[nam_chr1_key] = $("#nam_chr1").val();
    });

    document.getElementById("nam_chr2").addEventListener("change", () => {
        let slot_and_name_id = `${$("#nxx_index").val().padStart(2, '0')}_${chara_data.struct.list.struct[current_selected_index]["string"]["#text"]}`;
        let nam_chr2_key = `nam_chr2_${slot_and_name_id}`;
        msbt_data[nam_chr2_key] = $("#nam_chr2").val();
    });

    document.getElementById("nam_chr3").addEventListener("change", () => {
        let slot_and_name_id = `${$("#nxx_index").val().padStart(2, '0')}_${chara_data.struct.list.struct[current_selected_index]["string"]["#text"]}`;
        let nam_chr3_key = `nam_chr3_${slot_and_name_id}`;
        msbt_data[nam_chr3_key] = $("#nam_chr3").val();
    });

    document.getElementById("nam_stage_name").addEventListener("change", () => {
        let slot_and_name_id = `${$("#nxx_index").val().padStart(2, '0')}_${chara_data.struct.list.struct[current_selected_index]["string"]["#text"]}`;
        let nam_stage_name_key = `nam_stage_name_${slot_and_name_id}`;
        msbt_data[nam_stage_name_key] = $("#nam_stage_name").val();
    });

    //#endregion

    //#endregion



    function saveCSSLayout() {
        // var display_characters = document.getElementById("non_hidden").children;
        // var hidden_characters = document.getElementById("hidden").children;

        // if (chara_data.length <= 0) {
        //     alert("No prc file is loaded!");
        // } else {
        //     var i = 0;
        //     for (let chara of display_characters) {
        //         chara_data.struct.list.struct[chara.id].sbyte[2]["#text"] = i;
        //         chara_data.struct.list.struct[chara.id].sbyte[1]["#text"] = i;

        //         let can_select_index = get_index_of_hash(chara_data.struct.list.struct[chara.id].bool, "can_select");
        //         if (chara_data.struct.list.struct[chara.id].string["#text"] == "random") {
        //             chara_data.struct.list.struct[chara.id].bool[can_select_index]["#text"] = "False";
        //         } else {
        //             chara_data.struct.list.struct[chara.id].bool[can_select_index]["#text"] = "True";
        //         }
        //         i++;
        //     }

        //     for (let chara of hidden_characters) {
        //         chara_data.struct.list.struct[chara.id].sbyte[2]["#text"] = -1;

        //         chara_data.struct.list.struct[chara.id].bool[3]["#text"] = "False";
        //     }
        // }
    }
}

function RandomizeMain() {
    chara_context_menu.style.display = "none";

    setTimeout(function() {
        var answer = confirm("Are you sure you want to randomize the order (You will lose your current order)?");

        if (answer) {
            var amount = window.electronAPI.prompt("How many do you want to keep? (0 for all)");
            if (amount) {

                if (amount == 0) {
                    amount = 999;
                }
                $("#non_hidden").randomize(".item");

                $("#non_hidden>div").slice(amount).each(function() {
                    if ($(this, ".class_name").text() != "RANDOM") {
                        moveElement(this);
                    }
                });
            }


        }
    }, 50);
}

/*
 * Thanks to Russ Cam and gruppler for this bit of code
 * https://stackoverflow.com/questions/1533910/randomize-a-sequence-of-div-elements-with-jquery
 */
(function($) {

    $.fn.randomize = function(childElem) {
        return this.each(function() {
            var $this = $(this);
            var elems = $this.children(childElem);

            elems.sort(function() { return (Math.round(Math.random()) - 0.5); });

            $this.detach(childElem);

            for (var i = 0; i < elems.length; i++)
                $this.append(elems[i]);

        });
    }
})(jQuery);