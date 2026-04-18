export {
  getEntityById,
  listEntities,
  listPersonsForEntity,
  type EntityDetail,
  type ListEntitiesOptions,
} from "./queries";

export {
  archiveEntity,
  createEntity,
  linkPersonToEntity,
  unarchiveEntity,
  unlinkPersonFromEntity,
  updateEntity,
} from "./mutations";

export {
  createEntityInput,
  linkPersonInput,
  updateEntityInput,
  type CreateEntityInput,
  type LinkPersonInput,
  type UpdateEntityInput,
} from "./schema";
