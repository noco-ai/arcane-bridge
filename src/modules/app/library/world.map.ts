type MapTile = {
  type:
    | "Land"
    | "Mountain"
    | "Ocean"
    | "Location"
    | "Forest"
    | "Desert"
    | "Grassland"
    | "Road";
  name?: string;
};

interface Point {
  x: number;
  y: number;
}

export class FictionalWorldMap {
  private grid: MapTile[][];
  private width: number;
  private height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.grid = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => ({ type: "Land" }))
    );
  }

  addMountain(x: number, y: number): void {
    if (this.isValidTile(x, y)) {
      this.grid[y][x].type = "Mountain";
    }
  }

  addOcean(x: number, y: number): void {
    if (this.isValidTile(x, y)) {
      this.grid[y][x].type = "Ocean";
    }
  }

  addLocation(x: number, y: number, name: string): void {
    if (this.isValidTile(x, y) && this.grid[y][x].type === "Land") {
      this.grid[y][x] = { type: "Location", name };
    }
  }

  fillRandomTerrain(): void {
    const terrainTypes = ["Forest", "Desert", "Grassland", "Land"];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x].type === "Land") {
          const randomTerrain =
            terrainTypes[Math.floor(Math.random() * terrainTypes.length)];
          this.grid[y][x].type = randomTerrain as any;
        }
      }
    }
  }

  private constructRoad(start: Point, end: Point): void {
    const path = this.findPathBFS(start, end);
    path.forEach((point) => {
      if (
        this.grid[point.y][point.x].type !== "Mountain" &&
        this.grid[point.y][point.x].type !== "Ocean" &&
        this.grid[point.y][point.x].type !== "Location"
      ) {
        this.grid[point.y][point.x].type = "Road";
      }
    });
  }

  private findPathBFS(start: Point, end: Point): Point[] {
    const queue: Point[] = [start];
    const visited = new Set<string>();
    const cameFrom = new Map<string, Point>();
    visited.add(`${start.x},${start.y}`);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.x === end.x && current.y === end.y) {
        return this.reconstructPath(cameFrom, end);
      }

      this.getNeighbors(current).forEach((neighbor) => {
        const key = `${neighbor.x},${neighbor.y}`;
        if (
          !visited.has(key) &&
          this.grid[neighbor.y][neighbor.x].type !== "Mountain" &&
          this.grid[neighbor.y][neighbor.x].type !== "Ocean"
        ) {
          visited.add(key);
          queue.push(neighbor);
          cameFrom.set(key, current);
        }
      });
    }

    return []; // No path found
  }

  private getNeighbors(point: Point): Point[] {
    const neighbors: Point[] = [];
    const directions = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];

    directions.forEach((dir) => {
      const neighbor = { x: point.x + dir.x, y: point.y + dir.y };
      if (this.isValidTile(neighbor.x, neighbor.y)) {
        neighbors.push(neighbor);
      }
    });

    return neighbors;
  }

  private reconstructPath(
    cameFrom: Map<string, Point>,
    current: Point
  ): Point[] {
    const path = [];
    while (cameFrom.has(`${current.x},${current.y}`)) {
      path.unshift(current);
      current = cameFrom.get(`${current.x},${current.y}`)!;
    }
    return path;
  }

  fillClusters(): void {
    const terrainTypes = ["Forest", "Desert", "Grassland", "Mountain"];
    const numberOfSeeds = 8; // Number of seeds for each terrain type
    const clusterSize = 16; // Maximum size of each cluster

    // Seed initial points
    terrainTypes.forEach((type) => {
      for (let i = 0; i < numberOfSeeds; i++) {
        const x = Math.floor(Math.random() * this.width);
        const y = Math.floor(Math.random() * this.height);
        this.expandCluster(x, y, type as any, clusterSize);
      }
    });
  }

  private expandCluster(
    x: number,
    y: number,
    type: MapTile["type"],
    size: number
  ): void {
    if (
      size <= 0 ||
      !this.isValidTile(x, y) ||
      this.grid[y][x].type !== "Land"
    ) {
      return;
    }

    this.grid[y][x].type = type;

    // Randomly decide which neighboring tiles to expand to
    const neighbors = [
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
    ];
    neighbors.forEach(({ dx, dy }) => {
      if (Math.random() < 0.5) {
        // 50% chance to expand to each neighbor
        this.expandCluster(x + dx, y + dy, type, size - 1);
      }
    });
  }

  private isValidTile(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  connectLocationsWithRoads(): void {
    const locations = this.findAllLocations();
    for (let i = 0; i < locations.length - 1; i++) {
      for (let j = i + 1; j < locations.length; j++) {
        this.constructRoad(locations[i], locations[j]);
      }
    }
  }

  private findAllLocations(): Point[] {
    const locations: Point[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.grid[y][x].type === "Location") {
          locations.push({ x, y });
        }
      }
    }
    return locations;
  }

  printMap(): void {
    for (let row of this.grid) {
      let rowString = row
        .map((tile) => {
          switch (tile.type) {
            case "Road":
              return "🟫";
            case "Land":
              return "🟩";
            case "Mountain":
              return "🏔️";
            case "Ocean":
              return "🌊";
            case "Location":
              return "🏰";
            case "Forest":
              return "🌳";
            case "Desert":
              return "🏜️";
            case "Grassland":
              return "🌾";
            default:
              return " ";
          }
        })
        .join(" ");
      console.log(rowString);
    }
  }

  printMapAsHTML(): string {
    let htmlOutput = '<div class="map-container">';
    for (let row of this.grid) {
      for (let tile of row) {
        htmlOutput += `<span class="map-tile">${this.getTileEmoji(
          tile.type
        )}</span>`;
      }
      htmlOutput += "<br>"; // New line for each row
    }
    htmlOutput += "</div>";
    return htmlOutput;
  }

  private getTileEmoji(tileType: MapTile["type"]): string {
    switch (tileType) {
      case "Land":
        return "🟩";
      case "Mountain":
        return "🏔️";
      case "Ocean":
        return "🌊";
      case "Location":
        return "🏰";
      case "Forest":
        return "🌳";
      case "Desert":
        return "🟨";
      case "Grassland":
        return "🌾";
      case "Road":
        return "🟫";
      default:
        return " ";
    }
  }
}
