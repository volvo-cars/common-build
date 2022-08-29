export const DEFAULT_XML = `<?xml version="1.0" encoding="UTF-8"?>
<manifest>
  <remote name="origin" fetch="ssh://csp-gerrit-ssh.volvocars.biz" review=""/> 
  <remote name="gitlab" fetch="https://gitlab.volvocars.biz/repo" review=""/> 
  <default revision="master" remote="origin" sync-s="true" sync-j="4" sync-c="true" />
  <!-- component -->
  <project
    path="components/application_framework_core"
    name="playground/cynosure/cynosure_a.git" 
    revision="v1.0.0"
    label="a"
    remote="origin"
  />
  <project
    path="components/application_framework_core"
    name="playground/cynosure/cynosure_b.git"
    revision="refs/tags/v2.0.0"
    label="b"
  />   
  <project
    path="components/api_component_generator"
    name="flash-tools" 
    remote="gitlab"
    revision="refs/tags/v3.0.0"
    />
</manifest>
`
export const DEPENDENCIES_YAML =
  `version: 1
artifacts:
  localDir: external-dependencies 
  remote: remote
  repository: repo
  items:
    - path: A/A
      remote: remote_override
      repository: repo_override
      revision: 1.0.0
      subDir?: hi 
    - path: A/B
      revision: 1.1.0
      labels: B
      subDir?: CSP
      qualifiers:
        - file: HIA.tar.gz
    - path: A/C
      revision: 1.2.0
      labels: B C
      qualifiers:
        - file: objects.tar.gz
        - file: headers.tar.gz
`
