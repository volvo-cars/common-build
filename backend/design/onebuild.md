


# Cynosure concepts

## Product
    
* Binary - An artifact (folder). Tagged with release tag in Cynosure.
     
## productUpdated
     type: source|blob
     namespace: PXXX
     instanceid: 1234   

## Chain
```
    criteria: repo(product) 
              track: master|patch-
```


## Template: Generates 


Binary is product of one repo.
Source is product of many binaries.

onProductUpdate(self:ProductUpdate) {
    commit = convert(pu.instanceId)
    repo = convertToRepo(pu.namespace)
    branch = pu.track
    if(isOneBuild(branch)) {
        recordBuildState(success)
        alt1:
            products = convert(dependencies)
            cynosure.updateListeners(pu.namespace,pu.track,products+criterias(tags),"param=repo+branch") 
        gate = getGateConfig(gate.yml, commit, repo)
        if(gate.autorelease) {
            release(commit,branch)
        }
    }
}

onProductUpdate(dependency:ProductUpdate) {
    artifact = convertToArtifact(dependency.product, dependency.instance)
    alt1: Cynosure different invokers (unique rest-endpoint) 
        repo = dependency.repo (triggered in Action)
        change = repo.updateDependency(artifact)
        queue(repo).upsert(change).sort()
    alt2: Cynosure single invoker
        repos[] = cynosure.findProductOf(dependency.product)
        repos.foreach( repo => 
            change = repo.updatedDependency(artifact)
            queue(repo).upsert(change).sort()
        )
}

while(System.active) {
    change = waitNext
    change.rebase()
    if(!change.inconstencies) {
        prepareDependencies()
        job = startJob(change)
        job.wait()
        finishedJob? = queue.setResult(change,job.result)
        history.add(finishedJob)
        if(publish) {
            sha: git-sha
            repo: snapshot
            content: 
            publishArtifacts(artifact-pack.xml)
                name: git-sha
        }
        if(gate.merge | release) {
            target.ff(change.sha)
            if(gate(change.sha).release) {
                release(change.sha, target)
            }
        }        
    }
}

release(sha, target) {
    version = target.next()
    artifacts = moveArtifactsToRelease(version)
    setTagGit(version)
    broadCast(artifacts)
}


# Tooling

extractVersion(alias)


Publish artifact-pack.yml
- artifacts:
    - artifact-ref: csp/vcu
    - local-path: folder|file folder -> files, file -> file
    - remote-path?: none 
- dockers:

}




cmd: publish () -> Make arifacts available.
pack manifest:


Run(repo,sha, tags, type) {
    checkout repo/sha -> dir
    cd dir
    cmd = extractCmd(type, tags)
    try {
        cmd.execute()
        verdict(pass)
    } catch {
        verdict(fail)
    }
}

/git:
chain-file: onProductUpdated(self). On OneBuild brancher: save-success auto-release? register dependency triggers.
            onProduceUpdated(dependency):  upsert changes for 

Rest:
    /product-updated/dependency?to-repo=string ()
    /product-updated/self
    /manifest-to-productof
    /

Service {
    artifact = convertProductToArtifact(namespace,instance)
    (branch,repo) = convertProductToRepository(namespace,instance,track)
    boolean = isCompliant(branch)
    gate = getConfig(repo, gittish)
    upsertDependency(repo, branch,dependency, tags): Change?
    queue = queue(repo)
}

Queue {
    upsertChange(change)
    sort()
    next(): Change?
}

Actions are Http REST api requests to OneBuild.

Every change is serial built  -> build result defined as commit -> result. If latest has no STATUS -> Launch build.
No Version info in artifacts (destroys build). 


a. Per repo. Point to different URL? Message property?
b. One callback for all product created.

Victoria picked up product. Callbacks from there is OpenBuild signal.
ProductOf is already defined (transform)








// Artifacts are built on master - named /commit-sha/ stored in SNAPSHOT repo.
// Release: Rename artifacts to /version/ and move to release folder.

Run job:

Build tools:

getRevision("builderImage"):string




