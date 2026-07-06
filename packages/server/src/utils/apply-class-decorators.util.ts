import type { Type } from '@nestjs/common';

/**
 * Applies user-supplied class decorators to a generated controller with standard
 * TypeScript semantics via `Reflect.decorate`: bottom-up application order (as if
 * stacked above the class) and replacement return values honored.
 */
export function applyClassDecorators(
  target: Type<unknown>,
  decorators?: ClassDecorator[],
): Type<unknown> {
  if (!decorators?.length) return target;
  return Reflect.decorate(decorators, target) as Type<unknown>;
}
