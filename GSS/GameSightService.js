// Helpers ==================================================================================
// This is only needed IF we do not have environments
let getKey = function (isProd) {
                     // Production                        // Sandbox
    return isProd ?  "a83e3d539e3887ca9e1def55ca28203e" : "e3174c7a9c40e5d4431d0cc7034ecf50";
};

let getExternalIDs = function (platformName, platformAccountId, userName) {
    let external_ids = [];
    if (platformName.includes('xbox')) {
        external_ids = [
            {
                external_id_type: 'xuid',
                external_id: platformAccountId
            },
            {
                external_id_type: 'xbgt',
                external_id: userName
            }
        ];
    } else if (platformName.includes('playstation')) {
        external_ids = [
            {
                external_id_type: 'psn_uid',
                external_id: platformAccountId
            },
            {
                external_id_type: 'psid',
                external_id: userName
            }
        ];
    } else if (platformName === 'nintendo') {
        external_ids = [
            {
                external_id_type: 'na_id',
                external_id: platformAccountId
            },
            {
                external_id_type: 'na_name',
                external_id: userName
            }
        ];
    } else if (platform.includes('steam'))
    {
        external_ids = [
            {
                external_id_type: 'steamid64',
                external_id: platformAccountId
            }
        ];
    } else if(platform.includes('epic'))
    {
        external_ids = [
            {
                external_id_type: 'epicgs_id',
                external_id: platformAccountId
            }
        ];
    }

    return external_ids;
};

let getIdentifiers = function (platformName, os, resolution) {
    let identifiers = {};
    if (platformName === 'steam' || platformName === 'epicgs') {
        identifiers = {
            'platform': platformName,
            'os': os,
            'resolution': resolution
        }
    } else {
        identifiers = { 'platform': platformName };
    }

    return identifiers;
};


let createBasePayload = function(type, request){
    let payload = 
    {
        user_id: request.body.hydra_public_id,
        ip: request.userRequest.headers['http-x-forwarded-for'],
        type: type,
        external_ids: getExternalIDs(request.body.platform_name, request.body.account_platform_id, request.body.user_name),
        identifiers: getIdentifiers(request.body.platform_name, request.body.os, request.body.resolution)
    };

    return payload;
};

// For cumulative and once_per_user 
let createRevenuePayload = function (type, revenueType, request) {
    let payload = createBasePayload(type, request);
    payload.revenue_currency = request.body.revenue_currency;
    payload.revenue_amount = request.body.revenue_amount;
    payload.revenue_type = revenueType;

    return payload;
};

let sendPayload = function(payload, envKey) {
    let options = {
        headers: {
            'Authorization': envKey, 
            'X-Api-Version': '1.1.0',
            'Content-Type': 'application/json'
        },
        body: payload,
        json: true
    };
    Requests.post("https://api.ingest.in.wbgames.com/events", options);
};

function resolveFirstPartyIds(identityModel) {
    /** Gobi 
     * Gamesight external ID types:
     * psid
     * psn_uid
     * xbgt
     * xuid
     * steamid64
     * epicgs_id
     */

    const externalIds = [];
    if (identityModel.alternate !== undefined) {
        if (identityModel.alternate.ps4 !== undefined) {
            externalIds.push({
                external_id_type: 'psn_uid',
                external_id: identityModel.alternate.ps4[0].id
            });
            externalIds.push({
                external_id_type: 'psid',
                external_id: identityModel.alternate.ps4[0].username
            });
        } else if (identityModel.alternate.xb1 !== undefined) {
            externalIds.push({
                external_id_type: 'xuid',
                external_id: identityModel.alternate.xb1[0].id
            });
            externalIds.push({
                external_id_type: 'xbgt',
                external_id: identityModel.alternate.xb1[0].username
            });
        } else if (identityModel.alternate.nintendo_service !== undefined) {
            externalIds.push({
                external_id_type: 'na_id',
                external_id: identityModel.alternate.nintendo_service[0].id
            });
            if (identityModel.alternate.nintendo_service[0].username) {
                externalIds.push({
                    external_id_type: 'na_name',
                    external_id: identityModel.alternate.nintendo_service[0].username
                });
            }
        } else if (identityModel.alternate.steam !== undefined) {
            externalIds.push({
                external_id_type: 'steamid64',
                external_id: identityModel.alternate.steam[0].id
            });
        } else if (identityModel.alternate.epic !== undefined) {
            externalIds.push({
                external_id_type: 'epicgs_id',
                external_id: identityModel.alternate.epic[0].id
            });
        }
        
    }

    return externalIds;
}

function resolveGamesightPlatformIdentifier(ue4Platform, identityModel) {
    /** Gobi
     * NOTE:
     * UE4 sends up Windows as the platform in the user agent but we need to attempt to map that to either Steam or Epic if possible.
     * We do that using the identity model.
     */

    /** Gamesight platforms:
     * playstation_4
     * playstation_5
     * xbox_one
     * xbox_seriess
     * xbox_seriesx
     * steam
     * epicgs
     * windows
     */
    const lowerCasePlatform = ue4Platform.toLowerCase();

    if (lowerCasePlatform === 'windows') {
        if (identityModel.alternate) {
            if (identityModel.alternate.steam) {
                return 'steam';
            } else if (identityModel.alternate.epic) {
                return 'epicgs';
            } else {
                return 'windows';
            }
        }
    } else {
        switch (lowerCasePlatform) {
            case 'ps4':
            case 'playstation 4':
                return 'playstation_4';
            case 'ps5':
            case 'playstation 5':
                return 'playstation_5';
            case 'xboxonegdk':
                return 'xbox_one';
            case 'xsx':
                return 'xbox_seriesx';
            case 'switch':
                return 'nintendo_switch';
        }
    }

    return ue4Platform;
}

function createBasePayloadFromHeaders(type, req){

    const userAgent = req.userRequest.headers['http-user-agent'];
    if (!userAgent) {
        Logger.error(`missing expected header: ${userAgentHeader}`);
        return;
    }

    const ipAddress = req.userRequest.headers['http-x-forwarded-for'];
    if (!ipAddress) {
        Logger.error(`missing expected header: ${ipAddressHeader}`);
        return;
    }

    const desktopRes = req.userRequest.headers['http-x-trs-desktop-res'];

    const firstSpaceIndex = userAgent.indexOf(' ');
    if (firstSpaceIndex === -1) {
        Logger.error(`invalid user agent: ${userAgent}`);
        return;
    }
    
    const platformAndOSVersion = userAgent.substr(firstSpaceIndex + 1);
    const firstSlashIndex = platformAndOSVersion.indexOf('/');
    if (firstSlashIndex === -1) {
        Logger.error(`invalid user agent: ${userAgent}`);
        return;
    }

    var ue4Platform = platformAndOSVersion.substr(0, firstSlashIndex);
    // I have seen this in a few user agents for playstation 4 and 5 '-UE4/0.1 libhttp/5.10 (PlayStation #)'
    // below is my fix
    if(ue4Platform === 'libhttp')
    {
        const firstParenthesisIndex = userAgent.indexOf('(');
        ue4Platform = userAgent.substr(firstParenthesisIndex + 1);
        ue4Platform = ue4Platform.replace(')', '');
        Logger.info(`Platform: ${ue4Platform}`);
    }

    const accountModel = req.model;
    if (!accountModel) {
        Logger.error('missing account model');
        return;
    }
    
    const hydraPublicId = accountModel.public_id;
    if (!hydraPublicId) {
        Logger.error('missing public_id');
        return;
    }

    const identityModel = accountModel.identity;
    if (!identityModel) {
        Logger.error('missing identity model');
        return;
    }

    const firstPartyIds = resolveFirstPartyIds(identityModel);
    // we don't need the first party IDs to send the event
    // if (firstPartyIds.length == 0) {
    //     Logger.info(`failed to resolve first party IDs, nothing to do`);
    //     return;
    // }

    const identifiers = {
        platform: resolveGamesightPlatformIdentifier(ue4Platform, identityModel),
        os: platformAndOSVersion
    };
    if (desktopRes) {
        identifiers.resolution = desktopRes;
    }

    const gamesightPayload = {
        user_id: hydraPublicId,
        ip: ipAddress,
        type: type, 
        identifiers: identifiers

    };  

    if(firstPartyIds.length > 0)
        gamesightPayload.external_ids = firstPartyIds


    return gamesightPayload;
}

// for ssc usage in afterOnline or afterValidateAuth
async function recordGameLaunchEvent(req){  
    
    
    const gamesightPayload = createBasePayloadFromHeaders('game_launch', req)

    Logger.info('gamesight payload:');
    Logger.info(gamesightPayload);
    
    sendPayload(gamesightPayload, getKey(false)); // must change this to true for prod
}
// End Gobi SSC =============================================================================

// Custom Hydra Endpoints ===================================================================
Hydra.put('game_launch_event', async function (request) {
    if(request.body.bIgnore)
        return;
        
    let payload = createBasePayload('game_launch', request);
    let isProduction = request.body.is_production;

    sendPayload(payload, getKey(isProduction));   
});

Hydra.put('ingame_purchase_event', async function (request) {
    if(request.body.bIgnore)
        return;

    let payload = createRevenuePayload('ingame_purchase', 'cumulative', request);
    payload.transaction_id = request.body.transaction_id;
    let isProduction = request.body.is_production;

    sendPayload(payload, getKey(isProduction));   
});

Hydra.put('dlc_event', async function (request) {
    if(request.body.bIgnore)
        return;
        
    let payload = createRevenuePayload(request.body.type, 'once_per_user', request);
    let isProduction = request.body.is_production;

    sendPayload(payload, getKey(isProduction));   
});

Hydra.put('consumable_event', async function (request) {
    if(request.body.bIgnore)
        return;
        
    let payload = createRevenuePayload(request.body.type, 'cumulative', request);
    let isProduction = request.body.is_production;

    sendPayload(payload, getKey(isProduction));     
});
// End Custom Hydra Endpoints ===============================================================

// Cause there is no afterOnline hook in Pheonix
Hydra.account.afterOnline(async function (request){
    Logger.level = Logger.INFO

    try{
        recordGameLaunchEvent(request)
    }
    catch(e){
        Logger.error(`unhandled exception caught: ${JSON.stringify(e)}`)
    }

    return new SSCSuccess(0, {})
});