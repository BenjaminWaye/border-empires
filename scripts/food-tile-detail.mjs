// Small authored additions, in the original exports' local coordinates.
// Kept below the original silhouettes and inside their original footprints.
export function addFoodTileDetail(three, parts, kind) {
  const { BoxGeometry, BufferAttribute, Color, CylinderGeometry, IcosahedronGeometry, TorusGeometry } = three;
  const add = (geometry, color, x, y, z, rotation = 0) => {
    geometry.rotateY(rotation).translate(x, y, z);
    const part = geometry.index ? geometry.toNonIndexed() : geometry;
    if (part !== geometry) geometry.dispose();
    part.deleteAttribute("uv");
    const rgb = new Color(color);
    const colors = new Float32Array(part.getAttribute("position").count * 3);
    for (let i = 0; i < colors.length; i += 3) rgb.toArray(colors, i);
    part.setAttribute("color", new BufferAttribute(colors, 3));
    parts.push(part);
  };
  const box = (color, x, y, z, w, h, d, rotation = 0) => add(new BoxGeometry(w, h, d), color, x, y, z, rotation);
  if (kind === "farmland") {
    // Irrigation headers give the beds a deliberately engineered edge.
    for (const [x, z, w, d] of [[0.159, 0.285, 0.584, 0.438], [0.26, -0.209, 0.363, 0.516], [-0.202, -0.301, 0.524, 0.341]]) {
      box("#647577", x, 0.008, z - d / 2 + 0.004, w - 0.012, 0.012, 0.008);
      box("#647577", x - w / 2 + 0.004, 0.008, z, 0.008, 0.012, d - 0.012);
      // Seed-head clusters break up the ruler-straight crop stripes.
      for (let row = 0; row < 5; row += 1) for (let col = 0; col < 6; col += 1) {
        const px = x - w * 0.4 + col * w * 0.16;
        const pz = z - d * 0.39 + row * d * 0.19;
        const head = new IcosahedronGeometry(0.009, 0).scale(0.7, 0.8, 1);
        add(head, (row + col) % 3 === 0 ? "#b9c47a" : "#d6c281", px, 0.025, pz);
      }
    }
    // Silo seams and ladder; roof seams and the barn's framed loading door.
    for (const y of [0.055, 0.125, 0.197]) {
      const hoop = new TorusGeometry(0.0505, 0.002, 3, 16).rotateX(Math.PI / 2);
      add(hoop, "#a4afa7", -0.305, y, 0.113);
    }
    for (const x of [-0.321, -0.298]) box("#b9bdb1", x, 0.109, 0.164, 0.003, 0.19, 0.004);
    for (let i = 0; i < 8; i += 1) box("#a4afa7", -0.3095, 0.026 + i * 0.023, 0.168, 0.024, 0.003, 0.004);
    box("#3c4645", -0.205, 0.031, 0.32, 0.004, 0.06, 0.075);
    for (const z of [0.28, 0.36]) box("#b8b39d", -0.201, 0.033, z, 0.005, 0.068, 0.006);
    box("#b8b39d", -0.201, 0.065, 0.32, 0.005, 0.006, 0.085);
    for (let i = 0; i < 6; i += 1) box("#929b94", -0.302, 0.18, 0.22 + i * 0.039, 0.006, 0.006, 0.002);
  } else {
    // Open timber landing between the shore props and boats. Individual
    // planks leave gaps so the underlying terrain/water is still visible.
    for (let i = 0; i < 11; i += 1) box(i % 3 ? "#8d8069" : "#b3a080", -0.19 + i * 0.045, 0.017, 0.1, 0.039, 0.025, 0.16);
    for (const x of [-0.2, 0.24]) for (const z of [0.03, 0.17]) {
      add(new CylinderGeometry(0.014, 0.017, 0.1, 6), "#655b4a", x, 0.045, z);
      add(new CylinderGeometry(0.018, 0.018, 0.008, 8), "#c3b294", x, 0.098, z);
    }
    // Reinforced basin rims and visible water rings beneath the existing
    // hoists. These are holding basins, not boats or drying facilities.
    for (const z of [-0.2735, 0.4055]) {
      const rim = new TorusGeometry(0.218, 0.009, 5, 24).rotateX(Math.PI / 2);
      add(rim, "#b4bdb6", 0.332, 0.102, z);
      const waterRing = new TorusGeometry(0.125, 0.0025, 3, 20).rotateX(Math.PI / 2);
      add(waterRing, "#759c9b", 0.332, 0.077, z);
      for (const dx of [-0.025, 0.025]) box("#a1aca5", 0.332 + dx, 0.06, z - 0.205, 0.005, 0.12, 0.006);
      for (let i = 0; i < 4; i += 1) box("#bcc2b4", 0.332, 0.025 + i * 0.025, z - 0.21, 0.055, 0.004, 0.006);
    }
    // Hut siding battens, door and restrained sea-green weathered trim.
    for (let i = 0; i < 7; i += 1) box("#b0aba0", -0.336, 0.09, -0.73 + i * 0.057, 0.004, 0.15, 0.005);
    box("#334e50", -0.331, 0.07, -0.54, 0.006, 0.12, 0.09);
    box("#c6bd9d", -0.327, 0.135, -0.54, 0.009, 0.008, 0.11);
  }
}
