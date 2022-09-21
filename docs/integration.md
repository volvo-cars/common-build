# Integration endpoints

## Upsert change
Consumes a tar-file and creates or updates a Gerrit Change for the given repository. The files in the change will have the same structure as the files in the provided tar-file.

Parameters:

* `storage` The logical name of the Source code repository (`csp-gerrit`)
* `id` The repositories path at the Source code repository (ex `csp/nodes/sga`) 
* `label` A Gerrit change hash-tag that will be used to update an existing Change of targeted for the same label and target branch.

Returns:
* `201 CREATED` upon successful exection

How to use:
> curl -X POST -v --header "Content-Type:application/octet-stream" --data-binary @somefile.tar.gz "https://common-build-staging.csp-dev.net/api/repository/update-content?storage=\<STORAGE\>&id=\<GERRIT-REPO-PATH\>&label=\<LABEL>\"