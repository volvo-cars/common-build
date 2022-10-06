local globalReadyQueueKey = KEYS[1]
local globalActiveQueueKey = KEYS[2]
local maxCount = ARGV[1]


local allStartables = redis.call("ZDIFF",2,globalReadyQueueKey,globalActiveQueueKey)
local startables = {unpack(allStartables,1,maxCount)}

local result = {}
local function takeQueue(localQueueKey)
    redis.call("ZINCRBY",globalReadyQueueKey, -1, localQueueKey)
    redis.call("ZADD",globalActiveQueueKey,1,localQueueKey)
    local localQueueActiveKey = localQueueKey..":active" 
    local canonicalRefs = redis.call("ZPOPMIN", localQueueKey)
    if(canonicalRefs and canonicalRefs[1]) then
        local canonicalRef = canonicalRefs[1]
        local lastCanonicalKey = localQueueKey..":canonical:"..canonicalRef 
        local serialized = redis.call("GET",lastCanonicalKey)
        redis.call("DEL",lastCanonicalKey)
        redis.call("HMSET", localQueueActiveKey, "canonical", canonicalRef, "serialized", serialized)
        result[#result+1] = serialized
    end
end    

for _, startable in ipairs(startables) do
    takeQueue(startable)
end

-- remove all zero members from ready queue
redis.call("ZREMRANGEBYSCORE",globalReadyQueueKey,"-inf",0)

return result


