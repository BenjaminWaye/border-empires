import { BoxGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Scene } from "three";
import type { Tile } from "./client-types.js";

type TownPopulationTier = NonNullable<NonNullable<Tile["town"]>["populationTier"]>;

export const createClientThreeTownLayer = (scene: Scene, maxVisibleTiles: number) => {
  const maxTownBuildingInstances = maxVisibleTiles * 6;
  const maxTownKeepInstances = maxVisibleTiles;

  const townWallFrontMaterial = new MeshStandardMaterial({ color: "#dce4ec", roughness: 0.82, metalness: 0.01, flatShading: true });
  const townWallSideMaterial = new MeshStandardMaterial({ color: "#97a4b2", roughness: 0.84, metalness: 0.01, flatShading: true });
  const townRoofTopMaterial = new MeshStandardMaterial({ color: "#cb9150", roughness: 0.86, metalness: 0, flatShading: true });
  const townRoofSideMaterial = new MeshStandardMaterial({ color: "#a76f37", roughness: 0.88, metalness: 0, flatShading: true });
  const townKeepMaterial = new MeshStandardMaterial({ color: "#c8d1de", roughness: 0.8, metalness: 0.02, flatShading: true });
  const townKeepCapMaterial = new MeshStandardMaterial({ color: "#e0b06b", roughness: 0.76, metalness: 0.03, flatShading: true });

  const townWallFrontGeometry = new BoxGeometry(0.28, 0.24, 0.22);
  const townWallSideGeometry = new BoxGeometry(0.08, 0.24, 0.22);
  const townRoofTopGeometry = new BoxGeometry(0.34, 0.08, 0.22);
  const townRoofSideGeometry = new BoxGeometry(0.08, 0.14, 0.22);
  const townKeepGeometry = new BoxGeometry(0.14, 0.4, 0.14);
  const townKeepCapGeometry = new BoxGeometry(0.19, 0.06, 0.19);

  const townWallFrontMesh = new InstancedMesh(townWallFrontGeometry, townWallFrontMaterial, maxTownBuildingInstances);
  const townWallSideMesh = new InstancedMesh(townWallSideGeometry, townWallSideMaterial, maxTownBuildingInstances);
  const townRoofTopMesh = new InstancedMesh(townRoofTopGeometry, townRoofTopMaterial, maxTownBuildingInstances);
  const townRoofSideMesh = new InstancedMesh(townRoofSideGeometry, townRoofSideMaterial, maxTownBuildingInstances);
  const townKeepMesh = new InstancedMesh(townKeepGeometry, townKeepMaterial, maxTownKeepInstances);
  const townKeepCapMesh = new InstancedMesh(townKeepCapGeometry, townKeepCapMaterial, maxTownKeepInstances);
  scene.add(townWallFrontMesh, townWallSideMesh, townRoofTopMesh, townRoofSideMesh, townKeepMesh, townKeepCapMesh);

  const tempMatrix = new Matrix4();
  const townWallFrontScaleMatrix = new Matrix4();
  const townWallSideScaleMatrix = new Matrix4();
  const townRoofTopScaleMatrix = new Matrix4();
  const townRoofSideScaleMatrix = new Matrix4();
  const townKeepScaleMatrix = new Matrix4();
  const townKeepCapScaleMatrix = new Matrix4();
  let townWallFrontCount = 0;
  let townWallSideCount = 0;
  let townRoofTopCount = 0;
  let townRoofSideCount = 0;
  let townKeepCount = 0;
  let townKeepCapCount = 0;

  const townTierShape = (tier: TownPopulationTier): { main: number; wing: number; keep: number } => {
    if (tier === "METROPOLIS") return { main: 1.2, wing: 1.05, keep: 1 };
    if (tier === "GREAT_CITY") return { main: 1.12, wing: 0.98, keep: 0.88 };
    if (tier === "CITY") return { main: 1.02, wing: 0.92, keep: 0.76 };
    if (tier === "TOWN") return { main: 0.9, wing: 0.82, keep: 0 };
    return { main: 0.78, wing: 0.7, keep: 0 };
  };

  const beginFrame = (): void => {
    townWallFrontCount = 0;
    townWallSideCount = 0;
    townRoofTopCount = 0;
    townRoofSideCount = 0;
    townKeepCount = 0;
    townKeepCapCount = 0;
  };

  const addTown = (tier: TownPopulationTier, x: number, z: number): void => {
    const shape = townTierShape(tier);
    const layout = [
      { ox: 0, oz: -0.03, scale: shape.main, y: 0.52 },
      { ox: -0.24, oz: 0.2, scale: shape.wing, y: 0.5 },
      { ox: 0.24, oz: 0.18, scale: shape.wing, y: 0.5 }
    ] as const;
    for (const building of layout) {
      townWallFrontScaleMatrix.makeScale(building.scale, building.scale, building.scale);
      tempMatrix.copy(townWallFrontScaleMatrix);
      tempMatrix.setPosition(x + building.ox - 0.03 * building.scale, building.y, z + building.oz);
      townWallFrontMesh.setMatrixAt(townWallFrontCount, tempMatrix);
      townWallFrontCount += 1;

      townWallSideScaleMatrix.makeScale(building.scale, building.scale, building.scale);
      tempMatrix.copy(townWallSideScaleMatrix);
      tempMatrix.setPosition(x + building.ox + 0.15 * building.scale, building.y, z + building.oz);
      townWallSideMesh.setMatrixAt(townWallSideCount, tempMatrix);
      townWallSideCount += 1;

      townRoofTopScaleMatrix.makeScale(building.scale, building.scale, building.scale);
      tempMatrix.copy(townRoofTopScaleMatrix);
      tempMatrix.setPosition(x + building.ox - 0.01 * building.scale, building.y + 0.16 * building.scale, z + building.oz);
      townRoofTopMesh.setMatrixAt(townRoofTopCount, tempMatrix);
      townRoofTopCount += 1;

      townRoofSideScaleMatrix.makeScale(building.scale, building.scale, building.scale);
      tempMatrix.copy(townRoofSideScaleMatrix);
      tempMatrix.setPosition(x + building.ox + 0.19 * building.scale, building.y + 0.13 * building.scale, z + building.oz);
      townRoofSideMesh.setMatrixAt(townRoofSideCount, tempMatrix);
      townRoofSideCount += 1;
    }
    if (shape.keep > 0) {
      townKeepScaleMatrix.makeScale(shape.keep, shape.keep, shape.keep);
      tempMatrix.copy(townKeepScaleMatrix);
      tempMatrix.setPosition(x + 0.03, 0.83, z - 0.11);
      townKeepMesh.setMatrixAt(townKeepCount, tempMatrix);
      townKeepCount += 1;

      townKeepCapScaleMatrix.makeScale(shape.keep, shape.keep, shape.keep);
      tempMatrix.copy(townKeepCapScaleMatrix);
      tempMatrix.setPosition(x + 0.03, 1.05, z - 0.11);
      townKeepCapMesh.setMatrixAt(townKeepCapCount, tempMatrix);
      townKeepCapCount += 1;
    }
  };

  const commitFrame = (): void => {
    townWallFrontMesh.count = townWallFrontCount;
    townWallSideMesh.count = townWallSideCount;
    townRoofTopMesh.count = townRoofTopCount;
    townRoofSideMesh.count = townRoofSideCount;
    townKeepMesh.count = townKeepCount;
    townKeepCapMesh.count = townKeepCapCount;
    townWallFrontMesh.instanceMatrix.needsUpdate = true;
    townWallSideMesh.instanceMatrix.needsUpdate = true;
    townRoofTopMesh.instanceMatrix.needsUpdate = true;
    townRoofSideMesh.instanceMatrix.needsUpdate = true;
    townKeepMesh.instanceMatrix.needsUpdate = true;
    townKeepCapMesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    townWallFrontGeometry.dispose();
    townWallSideGeometry.dispose();
    townRoofTopGeometry.dispose();
    townRoofSideGeometry.dispose();
    townKeepGeometry.dispose();
    townKeepCapGeometry.dispose();
    townWallFrontMaterial.dispose();
    townWallSideMaterial.dispose();
    townRoofTopMaterial.dispose();
    townRoofSideMaterial.dispose();
    townKeepMaterial.dispose();
    townKeepCapMaterial.dispose();
  };

  return { beginFrame, addTown, commitFrame, dispose };
};
