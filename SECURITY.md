# Security and data handling

## What leaves the machine

Each model call includes the project's `agent.md`, `memory.md`, the task, and required tool results. A file read can therefore send source text to DeepSeek. Select only a project you are authorized to share with the provider. Filename checks do not identify every secret embedded in ordinary source files.

## Credential storage

The Web core stores authentication, cookies, its local API key, browser profile and session state under `runtime/upstream/`. Git ignores this directory. Do not publish it, attach it to an issue, or include it in a release archive.

The file-agent layer blocks known credential paths, including `auth.json`, `.api-key`, `sessions.json` and `chrome-profile`. Windows directories inherit NTFS permissions; POSIX `mode` values do not by themselves establish a Windows owner-only ACL.

## File operations

The model can request four allowlisted operations inside the chosen project. The runner does not execute returned text as JavaScript or shell commands. Traversal, links, protected state and known credential filenames are rejected. Existing-file replacement requires a matching hash, a unique search, a pre-edit backup and an audit entry.

These checks are application-level boundaries. A concurrent local process can still race path validation or overwrite checks; avoid simultaneous edits. The tool is not an operating-system sandbox. Backups contain full original file text and deserve the same care as the project itself.

## Network and upstream

The local adapter binds to loopback, requires a bearer key, rejects browser Origin requests and restricts the Host header. It accepts a narrow non-streaming text format. The bundled upstream core uses private DeepSeek endpoints and browser-derived authentication. Its availability and permissibility depend on the upstream service and its terms.

Unknown completion outcomes are not retried automatically. An interruption after an upstream completion or local edit can leave an uncertain or partial result; inspect the audit and backups before resending.

## Reporting

Contact the repository owner privately for a vulnerability involving credentials or local-file exposure. Public bug reports should contain a minimal synthetic fixture, the command, version and a sanitized error. Never post tokens, auth files, browser profiles, private project files or complete private prompts.
