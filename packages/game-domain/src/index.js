import { ATTACK_MANPOWER_COST, ATTACK_MANPOWER_MIN, BREAKTHROUGH_ATTACK_MANPOWER_COST, BREAKTHROUGH_ATTACK_MANPOWER_MIN, COMBAT_LOCK_MS, FRONTIER_CLAIM_MS } from "@border-empires/shared";
const manpowerRequirements = (actionType) => {
    if (actionType === "BREAKTHROUGH_ATTACK") {
        return {
            manpowerMin: BREAKTHROUGH_ATTACK_MANPOWER_MIN,
            manpowerCost: BREAKTHROUGH_ATTACK_MANPOWER_COST
        };
    }
    return {
        manpowerMin: ATTACK_MANPOWER_MIN,
        manpowerCost: actionType === "ATTACK" ? ATTACK_MANPOWER_COST : 0
    };
};
export const validateFrontierCommand = (input) => {
    const { manpowerMin, manpowerCost } = manpowerRequirements(input.actionType);
    if (input.actionType === "EXPAND" && input.to.ownerId) {
        return { ok: false, code: "EXPAND_TARGET_OWNED", message: "expand only targets neutral land" };
    }
    if (input.actionType === "ATTACK" && (!input.to.ownerId || input.to.ownerId === input.actor.id)) {
        return { ok: false, code: "ATTACK_TARGET_INVALID", message: "target must be enemy-controlled land" };
    }
    if (input.actionType === "BREAKTHROUGH_ATTACK" && !input.to.ownerId) {
        return { ok: false, code: "BREAKTHROUGH_TARGET_INVALID", message: "breakthrough requires enemy tile" };
    }
    if (input.actionType === "BREAKTHROUGH_ATTACK" && !input.actor.techIds.has(input.breakthroughRequiredTechId)) {
        return { ok: false, code: "BREAKTHROUGH_TARGET_INVALID", message: "requires Breach Doctrine" };
    }
    if (!input.isAdjacent && !input.isDockCrossing && !input.isBridgeCrossing) {
        return {
            ok: false,
            code: "NOT_ADJACENT",
            message: "target must be adjacent, valid dock crossing, or active aether bridge target"
        };
    }
    if (input.from.ownerId !== input.actor.id) {
        return { ok: false, code: "NOT_OWNER", message: "origin not owned" };
    }
    if (input.to.terrain !== "LAND") {
        return { ok: false, code: "BARRIER", message: "target is barrier" };
    }
    if (typeof input.originLockedUntil === "number" && input.originLockedUntil > input.now) {
        if (input.originLockOwnerId && input.originLockOwnerId !== input.actor.id) {
            return { ok: false, code: "LOCKED", message: "tile locked in combat" };
        }
        return {
            ok: false,
            code: "ATTACK_COOLDOWN",
            message: "origin tile is still on attack cooldown",
            cooldownRemainingMs: input.originLockedUntil - input.now
        };
    }
    if (typeof input.targetLockedUntil === "number" && input.targetLockedUntil > input.now) {
        if (input.targetLockOwnerId && input.targetLockOwnerId !== input.actor.id) {
            return { ok: false, code: "LOCKED", message: "tile locked in combat" };
        }
        return { ok: false, code: "LOCKED", message: "tile locked in combat" };
    }
    if ((input.actionType === "ATTACK" || input.actionType === "EXPAND") && input.actor.points < input.actionGoldCost) {
        return {
            ok: false,
            code: "INSUFFICIENT_GOLD",
            message: input.actionType === "ATTACK" ? "insufficient gold for attack" : "insufficient gold for frontier claim"
        };
    }
    if (input.actionType === "BREAKTHROUGH_ATTACK" && input.actor.points < input.breakthroughGoldCost) {
        return { ok: false, code: "INSUFFICIENT_GOLD", message: "insufficient gold for breakthrough" };
    }
    if (input.actor.manpower < manpowerMin) {
        return {
            ok: false,
            code: "INSUFFICIENT_MANPOWER",
            message: `need ${manpowerMin.toFixed(0)} manpower to launch attack`
        };
    }
    if (input.defenderIsAlliedOrTruced) {
        return { ok: false, code: "ALLY_TARGET", message: "cannot attack allied or truced tile" };
    }
    if (input.targetShielded) {
        return { ok: false, code: "SHIELDED", message: "target shielded" };
    }
    return {
        ok: true,
        origin: { x: input.from.x, y: input.from.y },
        target: { x: input.to.x, y: input.to.y },
        resolvesAt: input.now + (input.actionType === "EXPAND" ? FRONTIER_CLAIM_MS : COMBAT_LOCK_MS),
        manpowerCost,
        manpowerMin
    };
};
