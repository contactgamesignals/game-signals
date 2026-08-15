import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isOperatorUserIdAllowed } from "../lib/operator-access-core.ts";

const root = process.cwd();
const route = readFileSync(join(root, "app/api/accounting/launch-readiness/route.ts"), "utf8");
const wrapper = readFileSync(join(root, "lib/operator-access.ts"), "utf8");
const envExample = readFileSync(join(root, ".env.example"), "utf8");

const operatorA = "11111111-1111-4111-8111-111111111111";
const operatorB = "22222222-2222-4222-8222-222222222222";
const outsider = "33333333-3333-4333-8333-333333333333";

assert.equal(isOperatorUserIdAllowed(operatorA, undefined), false);
assert.equal(isOperatorUserIdAllowed(operatorA, ""), false);
assert.equal(isOperatorUserIdAllowed(operatorA, "not-a-uuid"), false);
assert.equal(isOperatorUserIdAllowed(outsider, `${operatorA},${operatorB}`), false);
assert.equal(isOperatorUserIdAllowed(operatorA, `${operatorA},${operatorB}`), true);
assert.equal(isOperatorUserIdAllowed(operatorB.toUpperCase(), ` ${operatorA}, ${operatorB.toUpperCase()} `), true);
assert.equal(isOperatorUserIdAllowed("not-a-uuid", operatorA), false);
assert.equal(isOperatorUserIdAllowed(null, operatorA), false);

assert.match(wrapper, /import "server-only"/);
assert.match(wrapper, /isOperatorUserIdAllowed/);
assert.match(wrapper, /GAMESIGNAL_OPERATOR_USER_IDS/);

assert.match(route, /isGameSignalOperator\(data\.user\.id\)/);
assert.match(route, /Operator access required\./);
assert.match(route, /operator-read-only/);
assert.doesNotMatch(route, /workspace_members/);
assert.doesNotMatch(route, /membership\.role/);
assert.ok(envExample.includes("GAMESIGNAL_OPERATOR_USER_IDS="));
assert.doesNotMatch(envExample, /NEXT_PUBLIC_GAMESIGNAL_OPERATOR_USER_IDS/);

console.log("Global launch readiness is fail-closed and restricted to explicit operator user IDs.");
