import { CommandStructure } from "../cmd";

export const name = "drive";
export const module: Record<string, CommandStructure> = {
  
}

class FileSystem {
  private readonly drive: string;
  private readonly path: string[] = [];
  constructor(
    drive: string
  ) {
    this.drive = drive;
  }

  cd(path: string) {
    
  }
}