local localQueueKey = KEYS[1]
local globalReadyQueueKey = KEYS[2]
local globalActiveQueueKey = KEYS[3]

local serializedRef = ARGV[1]

local localQueueActiveKey = localQueueKey..":active" 

local activeRef = redis.call('HGET',localQueueActiveKey,"serialized")
if(activeRef and activeRef == serializedRef) then
    redis.call("DEL",localQueueActiveKey)
    redis.call("ZREM",globalActiveQueueKey,localQueueKey)
    return "completed"
else
    return {"not_active",activeRef,serializedRef}
end

