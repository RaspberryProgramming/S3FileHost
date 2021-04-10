function preview() {
    let selected = document.getElementsByClassName("selected");
    for (i in selected) {
            if (selected[i].classList) {
                    let path = window.location.pathname;
                    path = path.split("/download")[path.split.length - 1];
                    window.location.href = "/preview-page" + path + "/" + selected[i].id;
            }
    }
}

function edit() {
    let selected = document.getElementsByClassName("selected");
    for (i in selected) {
            if (selected[i].classList) {
                    let path = window.location.pathname;
                    path = path.split("/download");
                    path = path[path.length - 1];
                    if (path === "/"){
                            path = "";
                    }
                    window.location.href = "/editor" + path + "/" + selected[i].id;
            }
    }
}

function download() {
function deleteFile() {
    let selected = document.getElementsByClassName("selected");
    for (i in selected) {
            if (selected[i].classList) {
                    let path = window.location.pathname;
            path = path.split("/download");
            path.shift();
            if (path.length <= 1) {
                path = "/"
            } else {
                path = path.join("/")
            }

            window.location.href = "/delete" + path + selected[i].id;
            }
    }
}

function select(id, path) {
    let selected = document.getElementsByClassName("selected");
    for (i in selected) {
            if (selected[i].classList) {
                    selected[i].classList.remove("selected");
            }
    }
    if (!document.getElementById(id).classList.contains("selected")) {
            document.getElementById(id).classList = "selected " + document.getElementById(id).classList;
    }

}

function search(searchTerm) {
    //let files = document.getElementById('files');
    let files = document.getElementsByClassName("file");
    let folders = document.getElementsByClassName("folder");

    for (let i = 0; i < files.length; i++) {
        
        if (files[i].id.includes(searchTerm)){
            files[i].style.display = "";
        } else {
            files[i].style.display = "none";
        }

    }

    for (let i = 0; i < folders.length; i++) {
        
        if (folders[i].id.includes(searchTerm)){
            folders[i].style.display = "";
        } else {
            folders[i].style.display = "none";
        }

    }
}

document.getElementById("tooltoggle").onclick = function () {
    let toolset = document.getElementById("toolset");
    if (toolset.style.display === "flex") {
            toolset.style.display = "none";

    } else {
            toolset.style.display = "flex";
    }
    console.log(toolset);
}
document.getElementById("fileupload").onchange = function () {
    document.getElementById("upload-form").submit();
};

(function () {
    function logElementEvent(eventName, element) {
            console.log(
                    Date.now(),
                    eventName,
                    element.getAttribute("data-src")
            );
    }

    var callback_enter = function (element) {
            logElementEvent("🔑 ENTERED", element);
    };
    var callback_exit = function (element) {
            logElementEvent("🚪 EXITED", element);
    };
    var callback_reveal = function (element) {
            logElementEvent("👁️ REVEALED", element);
    };
    var callback_loaded = function (element) {
           element.style['visibility'] = "visible";

            logElementEvent("👍 LOADED", element);
    };
    var callback_error = function (element) {

            logElementEvent("💀 ERROR", element);
            element.src =
                    "https://via.placeholder.com/440x560/?text=Error+Placeholder";
    };
    var callback_finish = function () {
            logElementEvent("✔️ FINISHED", document.documentElement);
    };

    var ll = new LazyLoad({
            elements_selector: "img[data-src]",
            // Assign the callbacks defined above
            callback_enter: callback_enter,
            callback_exit: callback_exit,
            callback_reveal: callback_reveal,
            callback_loaded: callback_loaded,
            callback_error: callback_error,
            callback_finish: callback_finish
    });
})();