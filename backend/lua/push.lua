local localQueueKey = KEYS[1]
local globalReadyQueueKey = KEYS[2]
local globalActiveQueueKey = KEYS[3]

local serializedRef = ARGV[1]
local canonicalRef = ARGV[2]
local localQueueScore = ARGV[3]

local localQueueActiveKey = localQueueKey..":active" 
local lastCanonicalKey = localQueueKey..":canonical:"..canonicalRef 


redis.call('ZADD', localQueueKey,'NX', localQueueScore,canonicalRef) -- Add the canonical ref to the local queue. Maintain time if already present.
local localQueueSize = redis.call("ZCARD",localQueueKey)
local oldCanonicalRef = redis.call('SET',lastCanonicalKey,serializedRef,'GET') -- Set the latest full ref for the canonical ref. Previous has not been activated yet (return to cancel)
if(not oldCanonicalRef) then
    redis.call("ZINCRBY",globalReadyQueueKey, 1, localQueueKey)
end
local activeRef = redis.call('HMGET',localQueueActiveKey,"canonical","serialized") -- Check if current executing is the same canonical - return for abort.
if(activeRef and activeRef[1]==canonicalRef) then
    redis.call('DEL', localQueueActiveKey)
    redis.call('ZREM', globalActiveQueueKey, localQueueKey)
    return {localQueueSize,oldCanonicalRef, activeRef[2]}
else 
    return {localQueueSize,oldCanonicalRef,nil}
end
