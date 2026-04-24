import { BoxGeometry, ConeGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Scene } from "three";
import type { Tile } from "./client-types.js";

export const createClientThreeResourceLayer = (scene: Scene, maxVisibleTiles: number) => {
  const farmMaterial = new MeshStandardMaterial({ color: "#a9c96a", roughness: 0.86, metalness: 0, flatShading: true });
  const fishMaterial = new MeshStandardMaterial({ color: "#74c8db", roughness: 0.65, metalness: 0.02, flatShading: true });
  const furMaterial = new MeshStandardMaterial({ color: "#956649", roughness: 0.84, metalness: 0, flatShading: true });
  const ironMaterial = new MeshStandardMaterial({ color: "#7f8794", roughness: 0.8, metalness: 0.03, flatShading: true });
  const gemsMaterial = new MeshStandardMaterial({ color: "#8ea0ff", roughness: 0.52, metalness: 0.08, flatShading: true });

  const farmGeometry = new BoxGeometry(0.32, 0.06, 0.24);
  const fishGeometry = new BoxGeometry(0.26, 0.05, 0.18);
  const furGeometry = new BoxGeometry(0.2, 0.15, 0.2);
  const ironGeometry = new ConeGeometry(0.15, 0.24, 5, 1, false);
  const gemsGeometry = new ConeGeometry(0.13, 0.29, 4, 1, false);

  const farmMesh = new InstancedMesh(farmGeometry, farmMaterial, maxVisibleTiles);
  const fishMesh = new InstancedMesh(fishGeometry, fishMaterial, maxVisibleTiles);
  const furMesh = new InstancedMesh(furGeometry, furMaterial, maxVisibleTiles);
  const ironMesh = new InstancedMesh(ironGeometry, ironMaterial, maxVisibleTiles);
  const gemsMesh = new InstancedMesh(gemsGeometry, gemsMaterial, maxVisibleTiles);
  scene.add(farmMesh, fishMesh, furMesh, ironMesh, gemsMesh);

  const tempMatrix = new Matrix4();
  let farmCount = 0;
  let fishCount = 0;
  let furCount = 0;
  let ironCount = 0;
  let gemsCount = 0;

  const beginFrame = (): void => {
    farmCount = 0;
    fishCount = 0;
    furCount = 0;
    ironCount = 0;
    gemsCount = 0;
  };

  const addResource = (resource: Tile["resource"], x: number, z: number): void => {
    if (resource === "FARM") {
      tempMatrix.makeTranslation(x - 0.15, 0.31, z + 0.08);
      farmMesh.setMatrixAt(farmCount, tempMatrix);
      farmCount += 1;
      tempMatrix.makeTranslation(x + 0.13, 0.3, z - 0.05);
      farmMesh.setMatrixAt(farmCount, tempMatrix);
      farmCount += 1;
      return;
    }
    if (resource === "FISH") {
      tempMatrix.makeTranslation(x, 0.07, z);
      fishMesh.setMatrixAt(fishCount, tempMatrix);
      fishCount += 1;
      return;
    }
    if (resource === "FUR" || resource === "WOOD") {
      tempMatrix.makeTranslation(x - 0.12, 0.34, z + 0.05);
      furMesh.setMatrixAt(furCount, tempMatrix);
      furCount += 1;
      tempMatrix.makeTranslation(x + 0.12, 0.34, z - 0.08);
      furMesh.setMatrixAt(furCount, tempMatrix);
      furCount += 1;
      return;
    }
    if (resource === "IRON") {
      tempMatrix.makeTranslation(x, 0.35, z);
      ironMesh.setMatrixAt(ironCount, tempMatrix);
      ironCount += 1;
      return;
    }
    if (resource === "GEMS") {
      tempMatrix.makeTranslation(x, 0.36, z);
      gemsMesh.setMatrixAt(gemsCount, tempMatrix);
      gemsCount += 1;
      return;
    }
  };

  const commitFrame = (): void => {
    farmMesh.count = farmCount;
    fishMesh.count = fishCount;
    furMesh.count = furCount;
    ironMesh.count = ironCount;
    gemsMesh.count = gemsCount;
    farmMesh.instanceMatrix.needsUpdate = true;
    fishMesh.instanceMatrix.needsUpdate = true;
    furMesh.instanceMatrix.needsUpdate = true;
    ironMesh.instanceMatrix.needsUpdate = true;
    gemsMesh.instanceMatrix.needsUpdate = true;
  };

  const dispose = (): void => {
    farmGeometry.dispose();
    fishGeometry.dispose();
    furGeometry.dispose();
    ironGeometry.dispose();
    gemsGeometry.dispose();
    farmMaterial.dispose();
    fishMaterial.dispose();
    furMaterial.dispose();
    ironMaterial.dispose();
    gemsMaterial.dispose();
  };

  return { beginFrame, addResource, commitFrame, dispose };
};
