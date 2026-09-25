# Parameters

Supported parameter types are `string`, `integer`, `boolean`, `enum`, `repository`, `path`, `git-ref`, `node`, `model-role`, and `duration`. Schemas can declare `required`, `default`, `description`, allowed `values`, and numeric minimum/maximum.

Unknown keys, missing required values, wrong types, invalid enum values, unsafe Git refs, root filesystem paths, and secret-shaped parameter names fail before a Run is created. Permanent Saved Job interfaces cannot become unvalidated JSON.

`repository` is resolved by Agent Control rather than interpolated as model text:

- absolute local paths must resolve beneath one of `jobs.repositoryRoots`;
- HTTPS or Git protocol remotes must match an explicit `jobs.repositoryRemotes` prefix;
- credentialed URLs, URL queries/fragments, relative paths, and unapproved remotes are rejected.

For local repositories the controller process must run on the selected node or otherwise share the same filesystem path. 3.4 does not pretend a controller-local path is remotely available merely because an SSH resource exists.

The dashboard builds form controls from this schema. CLI and HTTP requests reach the same server-side resolver; browser validation is convenience, never authority.
