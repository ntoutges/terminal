export const name = "drive";
export const module = {};
class FileSystem {
    drive;
    path = [];
    index; // non-circular, allows for easy saving
    localIndex; // circular; allows for jumping around easily
    constructor(drive) {
        this.drive = drive;
        const indexStr = localStorage.getItem(`Drive:${drive}/./index`); // due to ".", inaccessible by the rest of the program
        try {
            const index = JSON.parse(indexStr);
            this.index = index; // trust that index is valid
            // strangeness to setup circular references required by NavegableFileSystemIndex
            const localIndex = {};
            localIndex.local = localIndex;
            localIndex.last = localIndex;
            this.localIndex = localIndex;
            this.buildLocalIndex(this.localIndex, this.index);
        }
        catch (_) {
            this.index = {}; // no files yet
            // strangeness to setup circular references required by NavegableFileSystemIndex
            const localIndex = {};
            localIndex.local = localIndex;
            localIndex.last = localIndex;
            this.localIndex = localIndex;
            this.saveToPath("./index", JSON.stringify(this.index)); // save new index
        }
    }
    buildLocalIndex(localIndex, index) {
        for (let path in index) {
            const item = index[path];
            if (FileSystem.isFile(item)) { // basically the base case
                localIndex.local[path] = {
                    type: "file",
                    value: index[path]
                };
            }
            else { // item is folder
                localIndex.local[path] = {
                    type: "folder",
                    last: localIndex,
                    local: {}
                };
                this.buildLocalIndex(localIndex.local[path], index[path]);
            }
        }
    }
    saveToPath(path, item) {
        localStorage.setItem(`Drive:${this.drive}/${path}`, item);
    }
    cd(path) {
        const parts = path.split(/[\/\\]/g);
        for (const part of parts) {
            if (!this.moveStep(part)) {
                break;
            }
        }
        console.log(path);
    }
    moveStep(path) {
        if (path == ".")
            return true; // nothing needs to happend
        if (path == "..") {
            this.path.pop(); // go up one level
            this.localIndex = this.localIndex.last;
        }
        else if (path in this.localIndex.local) { // item exists, and it is a folder that can be navegated into
            const nextFolder = this.localIndex.local[path];
            if (FileSystem.isFolder(nextFolder)) {
                this.path.push(path);
                this.localIndex = nextFolder;
            }
            else
                return false; // cannot navegate into file (only into folder)
        }
        else
            return false; // path doesn't exist
        return true; // success!
    }
    static isFile(file) { return file.type == "file"; }
    static isFolder(folder) { return folder.type == "folder"; }
}
//# sourceMappingURL=drive.js.map