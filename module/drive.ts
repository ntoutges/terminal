import { CommandStructure } from "./cmd.js";

export const name = "drive";
export const module: Record<string, CommandStructure> = {
  
}

type FileSystemIndex = Record<string, any> // technically: Record<string,FileSystemIndex | FileType>, but typescript doesn't like that type of circular dependencies

export enum FileTypes {
  File,
  Folder
}

type FileType = {
  type: FileTypes.File,
  value: string
};

type NavegableFileSystemIndex = {
  type: FileTypes.Folder
  local: Record<string,NavegableFileSystemIndex | FileType>,
  last: NavegableFileSystemIndex
};

export class FileSystem {
  readonly drive: string;
  private path: string[] = [];
  private oldPaths: string[][] = [];
  
  private readonly index: FileSystemIndex; // non-circular, allows for easy saving
  
  private localIndex: NavegableFileSystemIndex; // circular; allows for jumping around easily
  private oldLocalIndices: NavegableFileSystemIndex[] = [];

  constructor(
    drive: string
  ) {
    this.drive = drive;

    const indexStr = localStorage.getItem(`Drive:${drive}/./index`); // due to ".", inaccessible by the rest of the program
    
    let constructNewIndex = false;
    if (indexStr !== null) {
      try {
        const index = JSON.parse(indexStr);
        
        this.index = index; // trust that index is valid
        
        // strangeness to setup circular references required by NavegableFileSystemIndex
        const localIndex: any = {};
        localIndex.local = {};
        localIndex.last = localIndex;
        this.localIndex = localIndex;
        this.buildLocalIndex(this.localIndex, this.index);
      }
      catch(_) { constructNewIndex = true; }
    }
    else constructNewIndex = true;
    
    if (constructNewIndex) {
      this.index = {}; // no files yet

      // strangeness to setup circular references required by NavegableFileSystemIndex
      const localIndex: any = {};
      localIndex.local = {};
      localIndex.last = localIndex;
      this.localIndex = localIndex;

      this.saveIndex(); // save new index
    }
  }

  private buildLocalIndex(
    localIndex: NavegableFileSystemIndex,
    index: FileSystemIndex
  ) {
    for (let path in index) {
      const item = index[path];
      if (typeof item == "string") { // basically the base case
        localIndex.local[path] = {
          type: FileTypes.File,
          value: index[path]
        };
      }
      else { // item is folder
        localIndex.local[path] = {
          type: FileTypes.Folder,
          last: localIndex,
          local: {}
        }
        this.buildLocalIndex(
          localIndex.local[path] as NavegableFileSystemIndex,
          index[path]
        );
      }
    }
  }

  private saveIndex() { this.saveToPath(`./index`, JSON.stringify(this.index)); }
  protected saveToPath(path: string, item: string) {
    localStorage.setItem(`Drive:${this.drive}/${path}`, item);
  }
  protected removeFromPath(path: string) {
    localStorage.removeItem(`Drive:${this.drive}/${path}`);
  }
  protected readFromPath(path: string, fallback: string = "") {
    const data = localStorage.getItem(`Drive:${this.drive}/${path}`);
    return data === null ? fallback : data;
  }

  // save current position
  protected stashLocation() {
    this.oldPaths.push(this.path.slice()); // copy
    this.oldLocalIndices.push(this.localIndex);
  }
  // retreive last saved position
  protected unstashLocation() {
    this.path = this.oldPaths.pop();
    this.localIndex = this.oldLocalIndices.pop();
  }

  // Change Directory
  cd(path: string) {
    const parts = path.split(/[\/\\]/g);
    if (parts.length == 0) return;

    // start out from root
    if (parts[0] == "") {
      while (this.path.length) { this.moveStep(".."); }
      parts.splice(0,1); // remove artifact of "/..."
    }

    for (const part of parts) {
      if (!this.moveStep(part)) {
        throw new Error(`\"${part}\" is not a valid path`);
      }
    }
  }

  protected moveStep(path: string) {
    if (path == ".") return true; // nothing needs to happend
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
      else return false; // cannot navegate into file (only into folder)
    }
    else return false; // path doesn't exist
    return true; // success!
  }

  // list... stuff?
  ls(path:string = null, ignorePsuedo: boolean = false) {
    let didStash = false;
    if (path) {
      didStash = true;
      this.stashLocation();
      try { this.cd(path); }
      catch (err) {
        this.unstashLocation();
        throw err;
      }
    }

    const items: {name:string, type:FileTypes}[] = [];

    if (!ignorePsuedo) { // ignore "." and ".."
      items.push({
        name: ".",
        type: FileTypes.Folder
      });
      if (this.path.length > 0) { // able to go back
        items.push({
          name: "..",
          type: FileTypes.Folder
        });
      }
    }

    for (const name in this.localIndex.local) {
      items.push({
        name,
        type: this.localIndex.local[name].type
      });
    }

    if (didStash) this.unstashLocation();
    return items;
  }

  // TODO: make this interpret "." and ".." for callers
  protected navigateUpTo(name:string): [boolean, string] {
    let didStash = false;
    if (name.includes("/")) {
      didStash = true;
      this.stashLocation();
      try {
        this.cd(name.substring(0,name.lastIndexOf("/"))); // get path portion
        name = name.substring(name.lastIndexOf("/")+1); // get name portion
      }
      catch (err) {
        this.unstashLocation();
        throw err;
      }
    }

    return [didStash,name];
  }

  // (con)cat(enate) -- return content of file; return list of files if folder; return empty string if invalid path
  read(name:string) {
    let path = name;
    let didStash = false;
    [didStash,name] = this.navigateUpTo(name);
    
    if (!(name in this.localIndex.local)) { // no file of this name exists here
      if (didStash) this.unstashLocation();
      throw new Error(`File \"${path}\" does not exist`);
    }

    const file = this.localIndex.local[name];
    if (FileSystem.isFile(file)) {
      let toReturn = this.readFromPath(`${this.path.join("/")}/${name}`, null);
      if (didStash) this.unstashLocation();
      if (toReturn === null) throw new Error(`ERROR: FILE \"${name}\" DOES NOT EXIST`)
      return toReturn;
    }

    if (didStash) this.unstashLocation();
    return this.ls().map((info) => { return info.name; }).join("\n");
  }

  // make directory
  mkdir(name: string) {
    let didStash = false;
    [didStash,name] = this.navigateUpTo(name);

    let err = "";
    if (name in this.localIndex.local) {
      const isFile = FileSystem.isFile(this.localIndex.local[name]);
      err = `${isFile ? "File" : "Folder"} with name \"${name}\" already exists`;
    }
    else {
      // update local index
      this.localIndex.local[name] = {
        type: FileTypes.Folder,
        last: this.localIndex,
        local: {}
      };

      // update index
      let head = this.index;
      for (const part of this.path) { head = head[part]; }
      head[name] = {};

      this.saveIndex();
    }
    if (didStash) this.unstashLocation();
    if (err) throw new Error(err);
  }

  save(name:string, data:string, append:boolean) {
    let didStash = false;
    [didStash,name] = this.navigateUpTo(name);

    let error = null;
    try {
      // check if file already exists
      if (name in this.localIndex.local) {
        if (FileSystem.isFolder(this.localIndex.local[name])) throw new Error(`\"${name}\" is a folder, not a file`); // cannot write to folder
        // else {} // CAN write to file; ignore
      }
      else this.mkfile(name); // file doesn't exist, make it
    }
    catch(err) { error = err; }

    // write data to file
    if (append) {
      const oldData = this.readFromPath(this.path.join("/") + "/" + name);
      data = oldData + data; // append
    }
    this.saveToPath(this.path.join("/") + "/" + name, data);

    if (didStash) this.unstashLocation();
    if (error) throw error;
  }

  // make file (user interfaces with this indirectly through writing to file)
  protected mkfile(name:string) {
    let didStash = false;
    [didStash,name] = this.navigateUpTo(name);

    let err = "";
    if (name in this.localIndex.local) {
      if (FileSystem.isFolder(this.localIndex.local[name])) err = `Folder with name \"${name}\" already exists`; // cannot overwrite folder
      else { // CAN overwrite file
        this.saveToPath(this.path.join("/") + "/" + name, ""); // save "" to file
      }
    }
    else { // create new file
      this.localIndex.local[name] = {
        type: FileTypes.File,
        value: ""
      };
      let head = this.index;
      for (const part of this.path) { head = head[part]; }
      head[name] = "";
      this.saveIndex();

      this.saveToPath(this.path.join("/") + "/" + name, ""); // save "" to file
    }

    if (didStash) this.unstashLocation();
    if (err) throw new Error(err);
  }

  rm(name:string, recursive:boolean = false) {
    let didStash = false;
    [didStash,name] = this.navigateUpTo(name);

    let error = null;
    try {
      if (name in this.localIndex.local) {
        if (FileSystem.isFolder(this.localIndex.local[name])) {
          if (recursive) this.removeFolder(name);
          else throw new Error("Unable to remove recursive folder");
        }
        else this.removeFile(name) // simply removing file
      }
      else { // no file/folder exists with that name
        throw new Error(`No file or folder with name \"${name}\" exists`);
      }
    }
    catch (err) { error = err; }

    this.saveIndex();
    if (didStash) this.unstashLocation();
    
    // find where closest "safe" (not deleted) folder is
    let head = this.index;
    let maxSafeDepth = this.path.length;
    for (let i in this.path) { // repeatedly go back until in an actual folder (in case removed folder that was being worked in)
      const part = this.path[i];
      if (part in head) {
        head = head[part];
      }
      else {
        maxSafeDepth = +i;
        break;
      }
    }

    // go back the amount of times need to find a "safe" folder
    for (let i = this.path.length; i > maxSafeDepth; i--) { this.cd(".."); }
    

    if (error) throw error;
  }

  private removeFile(name:string) {
    // remove entry in localIndex
    delete this.localIndex.local[name];

    // remove entry in index
    let head = this.index;
    for (const part of this.path) { head = head[part]; }
    delete head[name];

    // remove actual entry
    this.removeFromPath(this.path.join("/") + "/" + name);

    // expect caller to call saveIndex();
  }

  private removeFolder(name:string) {
    let files = (this.localIndex.local[name] as NavegableFileSystemIndex).local;
    this.cd(name); // move forward a step to delete stuff
    for (let file in files) {
      if (FileSystem.isFile(files[file])) {
        this.removeFile(file);
      }
      else {
        // remove contents of folder
        this.removeFolder(file);
      }
    }
    
    this.cd(".."); // back out a step

    // remove entry in localIndex
    delete this.localIndex.local[name];
        
    // remove entry in index
    let head = this.index;
    for (const part of this.path) { head = head[part]; }
    delete head[name];

    // expect caller to call saveIndex();
  }

  get pathString() { return this.drive + ":/" + this.path.join("/"); }

  exists(name:string) {
    let didStash = false;
    [didStash,name] = this.navigateUpTo(name);
    
    let exists = (name in this.localIndex.local);
    if (didStash) { this.unstashLocation(); }

    return exists;
  }
  isFile(name:string) {
    if (!this.exists(name)) return false;

    let didStash = false;
    [didStash,name] = this.navigateUpTo(name);
    
    let isFile = FileSystem.isFile(this.localIndex.local[name]);
    if (didStash) { this.unstashLocation(); }

    return isFile;
  }
  isDirectory(name:string) {
    if (!this.exists(name)) return false;

    let didStash = false;
    [didStash,name] = this.navigateUpTo(name);
    
    let isDir = FileSystem.isFolder(this.localIndex.local[name]);
    if (didStash) { this.unstashLocation(); }

    return isDir;
  }

  assertDirectory(name:string) { // force this to be a directory, even if already a file
    if (this.isDirectory(name)) return; // don't need to do anything
    if (this.exists(name)) this.rm(name); // replace offending file with directory
    this.mkdir(name);
  }
  assertFile(path:string) { // force this to be a file, even if already a directory
    if (this.isFile(name)) return; // don't need to do anything
    if (this.exists(name)) this.rm(name, true); // replace offending directory with file
    this.mkfile(name);
  }

  static isFile(file: NavegableFileSystemIndex | FileType): file is FileType { return file.type == FileTypes.File; }
  static isFolder(folder: NavegableFileSystemIndex | FileType): folder is NavegableFileSystemIndex { return folder.type == FileTypes.Folder; }
}