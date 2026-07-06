import { type CustomDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';

/**
 * Metadata key marking nest-mcp's generated HTTP controllers (transport endpoint,
 * `.well-known` discovery) as exempt from app-wide session/auth guards. Distinct from
 * `MCP_PUBLIC_METADATA`, which is the per-tool `@Public()` bypass inside the MCP
 * execution pipeline.
 */
export const MCP_HTTP_PUBLIC_METADATA = 'nest-mcp:http-public';

/**
 * Marks a controller (or handler) as public from the HOST APP's perspective: the route
 * must not be blocked by an application-wide auth guard. nest-mcp applies it to every
 * controller it generates — RFC 9728/8414 discovery documents are public by spec, and
 * the MCP endpoint authenticates via the MCP authorization spec (`McpBearerGuard`),
 * never via an app session.
 *
 * Apps with a global guard honor it with {@link isMcpPublic}:
 *
 * ```typescript
 * @Injectable()
 * export class AppAuthGuard implements CanActivate {
 *   constructor(private readonly inner: MyAuthGuard) {}
 *   canActivate(context: ExecutionContext) {
 *     if (isMcpPublic(context)) return true;
 *     return this.inner.canActivate(context);
 *   }
 * }
 * ```
 */
export function IsPublic(): CustomDecorator<string> {
  return SetMetadata(MCP_HTTP_PUBLIC_METADATA, true);
}

/** True when the route's controller class or handler carries {@link IsPublic} metadata. */
export function isMcpPublic(context: ExecutionContext): boolean {
  const cls = context.getClass?.();
  const handler = context.getHandler?.();
  return (
    (cls != null && Reflect.getMetadata(MCP_HTTP_PUBLIC_METADATA, cls) === true) ||
    (handler != null && Reflect.getMetadata(MCP_HTTP_PUBLIC_METADATA, handler) === true)
  );
}
