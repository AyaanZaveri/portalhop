/**
 * The shape of a @lucide/lab icon file.
 *
 * Those files ship no declarations, and a wildcard `declare module` does not
 * help: TypeScript resolves the real .js first and reports it as implicitly
 * any rather than falling back to an ambient declaration. tsconfig maps the
 * whole subpath here instead, which is the one lever that runs before
 * resolution.
 *
 * The node type is borrowed from what lucide-react-native's own Icon accepts,
 * since the library does not export it by name.
 */
declare const iconNode: React.ComponentProps<
  typeof import("lucide-react-native").Icon
>["iconNode"]

export default iconNode
