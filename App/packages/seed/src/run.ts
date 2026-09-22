import { seedWorld, serializeSeed } from "./index.js";

const result = seedWorld();
const data = serializeSeed(result);
console.log(
  JSON.stringify(
    {
      actors: data.actors.length,
      lots: data.lots.length,
      events: data.events.length,
      preferredTraceLotId: data.preferredTraceLotId,
      integrity: data.integrity,
    },
    null,
    2,
  ),
);
