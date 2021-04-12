function preview() {
    /**
     * preview: used when a file is selected, and the user wants to open a preview of the file
     */
    let selected = document.getElementsByClassName("selected"); // Grab all files that have been selected

    for (i in selected) { // Iterate through all of the selected items

        if (selected[i].classList.contains("selected")) { // Verify that this item actually is selected

            let path = window.location.pathname; // Grab the page's path
            path = path.split("/download"); // Separate "/download" from the path so we can recompile with the proper initial path
            path.shift(); // Delete the first element

            // Fix the path if we're at the root of the user's storage
            if (path.length <= 1) {
                path = "/"
            } else {
                path = path.join("/")
            }

            window.location.href = "/preview" + path + selected[i].id; // append /preview to the begining with file id, and redirect to the download
        }
    }
}

function edit() {
    /**
     * edit: used when a file is selected, and the user wants to open the file editor with that file.
     *       (This does not mean that it will run in the editor)
     */
    let selected = document.getElementsByClassName("selected"); // Grab all files that have been selected

    for (i in selected) { // Iterate through all of the selected items

        if (selected[i].classList.contains("selected")) { // Verify that this item actually is selected

            let path = window.location.pathname; // Grab the page's path
            path = path.split("/download"); // Separate "/download" from the path so we can recompile with the proper initial path
            path.shift(); // Delete the first element

            // Fix the path if we're at the root of the user's storage
            if (path.length <= 1) {
                path = "/"
            } else {
                path = path.join("/")
            }

            window.location.href = "/editor" + path + selected[i].id; // append /editor to the begining with file id, and redirect to the download
                
        }
    }
}

function download() {
    /**
     * download: used when a file is selected and the user wants to download the file
     */
    let selected = document.getElementsByClassName("selected"); // Grab all files that have been selected

    for (i in selected) { // Iterate through all of the selected items

        if (selected[i].classList.contains("selected")) { // Verify that this item actually is selected

            let path = window.location.pathname + "/"; // Grab the page's path
            
            window.location.href = path + selected[i].id; // Append the file's id so it will initiate a download, and redirect to the download
        }
    }
}

function deleteFile() {
    /**
     * deleteFile: used when a file is selected and the user wants to delete it
     */
    let selected = document.getElementsByClassName("selected"); // Grab all files that have been selected

    for (i in selected) { // Iterate through all of the selected items

        if (selected[i].classList.contains("selected")) { // Verify that this item actually is selected

            let path = window.location.pathname; // Grab the page's path

            path = path.split("/download");// Separate "/download" from the path so we can recompile with the proper initial path
            path.shift(); // Delete the first element

            // Fix the path if we're at the root of the user's storage
            if (path.length <= 1) {
                path = "/"
            } else {
                path = path.join("/")
            }

            window.location.href = "/delete" + path + selected[i].id; // append /delete to the begining with file id, and redirect to the download
        }
    }
}

function select(id, path) {
    /**
     * select: used when a file is clicked in order to select/deselect the file
     */
    let selected = document.getElementsByClassName("selected"); // Collect all elements on the page that are selected

    if (id in selected){ // check if the current item is already selected

        selected[id].classList.remove("selected"); // Deselect the item if its already selected
        selected[id].classList.add

    } else {
        // Otherwise, add selected to it's classList

        document.getElementById(id).classList.add("selected");

    }

}

function search(searchTerm) {
    /**
     * search: used to search using a specific term
     */
    // Get all files and folders
    let files = document.getElementsByClassName("file");
    let folders = document.getElementsByClassName("folder");

    for (let i = 0; i < files.length; i++) { // iterate through each file
        
        if (files[i].id.includes(searchTerm)){ // if the filename includes the search term, it will be enabled
            files[i].style.display = "";
        } else { // otherwise the file will be disabled and hidden
            files[i].style.display = "none";
        }

    }

    for (let i = 0; i < folders.length; i++) { // iterate through each file
        
        if (folders[i].id.includes(searchTerm)){ // if the folder name includes the search term, it will be enabled
            folders[i].style.display = "";
        } else { // otherwise it will be disabled and hidden
            folders[i].style.display = "none";
        }

    }
}

document.getElementById("tooltoggle").onclick = function () {
    /**
     * Used when on mobile. The tooltoggle button will enable or disable the tool menu so the user can work with the
     * files that they've selected or if they want to log out.
     */
    let toolset = document.getElementById("toolset"); // grab the toolset element
    if (toolset.style.display === "flex") { // if the toolset is enabled
        toolset.style.display = "none"; // disable it by setting it's display style to none

    } else {
        toolset.style.display = "flex"; // enable the toolset by setting it's display style to flex
    }
    
}

document.getElementById("fileupload").onchange = function () {
    /**
     * Used to upload files to the current folder. The file will immediately be submitted and uploaded. There currently
     * is no progress bar to let you know how far along the file is.
     */
    document.getElementById("upload-form").submit();
};

(function () {
    /**
     * Used to display progress of the lazyloader
     */

    function logElementEvent(eventName, element) {
        /**
         * logElementEvent: runs when an event occurs to log the occurence
         */
        // Log the event
        console.log(
            Date.now(), // add the date
            eventName, // add event name
            element.getAttribute("data-src") // add element image or placeholder
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