// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) RIT Services and contributors

import { prisma } from '../../db/prisma.js';
import { ErrorResponse } from '../../utils/errorResponse.js';
import { activityService } from '../activity/activityService.js';
import type { CustomFieldDefinition, CustomFieldType, Prisma } from '@prisma/client';

/** The wire shape of a single custom field value (JSON column payload). */
export type CustomFieldRawValue = string | number | boolean | null;

export interface CreateCustomFieldInput {
  projectId: string;
  name: string;
  type: CustomFieldType;
  options?: string[];
  isRequired?: boolean;
}

export interface UpdateCustomFieldInput {
  name?: string;
  options?: string[];
  isRequired?: boolean;
  order?: number;
}

function optionsOf(def: CustomFieldDefinition): string[] {
  return Array.isArray(def.options) ? (def.options as string[]) : [];
}

/**
 * Per-type value check against a definition. Returns the value to store, or
 * throws a 400 naming the offending field — the Zod layer only bounds the
 * payload shape, the type contract lives here next to the definitions.
 */
function validateValue(def: CustomFieldDefinition, value: CustomFieldRawValue): CustomFieldRawValue {
  if (value === null) return null;
  switch (def.type) {
    case 'text':
      if (typeof value !== 'string') throw ErrorResponse.badRequest(`${def.name} must be text`);
      return value;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw ErrorResponse.badRequest(`${def.name} must be a number`);
      }
      return value;
    case 'date':
      if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
        throw ErrorResponse.badRequest(`${def.name} must be a valid date`);
      }
      return value;
    case 'select': {
      if (typeof value !== 'string' || !optionsOf(def).includes(value)) {
        throw ErrorResponse.badRequest(`${def.name} must be one of its configured options`);
      }
      return value;
    }
    case 'checkbox':
      if (typeof value !== 'boolean') {
        throw ErrorResponse.badRequest(`${def.name} must be true or false`);
      }
      return value;
  }
}

/** Human-readable form for activity log from/to columns. */
function display(value: CustomFieldRawValue): string | null {
  if (value === null) return null;
  return String(value);
}

/**
 * Resolve the payload's definitions (must all belong to the project) and
 * type-check every value. Shared by the pre-create check and applyValues so a
 * bad entry always rejects the whole save before anything is written.
 */
async function loadAndValidate(projectId: string, values: Record<string, CustomFieldRawValue>) {
  const ids = Object.keys(values);
  if (ids.length === 0) return [];
  const defs = await prisma.customFieldDefinition.findMany({
    where: { id: { in: ids }, projectId },
  });
  const defById = new Map(defs.map((d) => [d.id, d]));
  if (ids.some((id) => !defById.has(id))) {
    throw ErrorResponse.badRequest('One or more custom fields do not belong to this project');
  }
  return ids.map((id) => ({
    def: defById.get(id)!,
    value: validateValue(defById.get(id)!, values[id]),
  }));
}

export const customFieldService = {
  list(projectId: string) {
    return prisma.customFieldDefinition.findMany({
      where: { projectId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });
  },

  async create(input: CreateCustomFieldInput) {
    if (input.type === 'select' && (!input.options || input.options.length === 0)) {
      throw ErrorResponse.badRequest('A select field needs at least one option');
    }
    const last = await prisma.customFieldDefinition.findFirst({
      where: { projectId: input.projectId },
      orderBy: { order: 'desc' },
      select: { order: true },
    });
    try {
      return await prisma.customFieldDefinition.create({
        data: {
          projectId: input.projectId,
          name: input.name.trim(),
          type: input.type,
          options: input.options ?? [],
          isRequired: input.isRequired ?? false,
          order: (last?.order ?? -1) + 1,
        },
      });
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2002') {
        throw ErrorResponse.badRequest('A field with this name already exists in the project');
      }
      throw err;
    }
  },

  async update(id: string, input: UpdateCustomFieldInput) {
    const def = await prisma.customFieldDefinition.findUnique({ where: { id } });
    if (!def) throw ErrorResponse.notFound('Custom field not found');
    if (def.type === 'select' && input.options && input.options.length === 0) {
      throw ErrorResponse.badRequest('A select field needs at least one option');
    }
    try {
      return await prisma.customFieldDefinition.update({
        where: { id },
        data: {
          name: input.name?.trim() ?? undefined,
          options: input.options ?? undefined,
          isRequired: input.isRequired ?? undefined,
          order: input.order ?? undefined,
        },
      });
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2002') {
        throw ErrorResponse.badRequest('A field with this name already exists in the project');
      }
      throw err;
    }
  },

  async remove(id: string) {
    const def = await prisma.customFieldDefinition.findUnique({ where: { id } });
    if (!def) throw ErrorResponse.notFound('Custom field not found');
    // Cascade wipes every stored CustomFieldValue for this definition.
    await prisma.customFieldDefinition.delete({ where: { id } });
    return { ok: true };
  },

  /** Validate-only precheck — used before creating a story so a bad value
   * rejects the request while the story doesn't exist yet. */
  async validateForProject(projectId: string, values: Record<string, CustomFieldRawValue>) {
    await loadAndValidate(projectId, values);
  },

  /**
   * Upsert/delete a story's custom field values from a `{ [definitionId]:
   * value }` map (null clears the value). Validates every entry against the
   * project's definitions BEFORE writing anything, then logs one
   * `custom_field_changed` activity entry per actual change.
   */
  async applyValues(
    storyId: string,
    projectId: string,
    values: Record<string, CustomFieldRawValue>,
    actorId: string,
  ) {
    const checked = await loadAndValidate(projectId, values);
    if (checked.length === 0) return;

    const existing = await prisma.customFieldValue.findMany({
      where: { storyId, fieldId: { in: Object.keys(values) } },
    });
    const existingByField = new Map(existing.map((v) => [v.fieldId, v]));

    for (const { def, value } of checked) {
      const prev = existingByField.get(def.id);
      const prevValue = (prev?.value ?? null) as CustomFieldRawValue;
      if (prevValue === value) continue;

      if (value === null) {
        if (prev) await prisma.customFieldValue.delete({ where: { id: prev.id } });
      } else {
        await prisma.customFieldValue.upsert({
          where: { storyId_fieldId: { storyId, fieldId: def.id } },
          update: { value: value as Prisma.InputJsonValue },
          create: { storyId, fieldId: def.id, value: value as Prisma.InputJsonValue },
        });
      }
      await activityService.log({
        storyId,
        actorId,
        event: 'custom_field_changed',
        fromValue: display(prevValue),
        toValue: display(value),
        meta: { fieldId: def.id, fieldName: def.name },
      });
    }
  },
};
