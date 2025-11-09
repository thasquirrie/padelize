/**
 * Guest Player Implementation Test & Usage Guide
 * 
 * This demonstrates how to create matches with guest players (non-registered users)
 */

console.log(`
========================================
GUEST PLAYER IMPLEMENTATION GUIDE
========================================

The Match model now supports GUEST PLAYERS - players who don't have accounts.

KEY CHANGES:
-----------
1. The 'player' field (ObjectId) is now OPTIONAL
2. The 'name' field is used for guest player names
3. New 'isGuest' boolean flag automatically set
4. Each player must have EITHER a 'player' OR a 'name'

SCHEMA STRUCTURE:
----------------
teams: [
  {
    players: [
      {
        player: ObjectId (optional - for registered users),
        name: String (optional - for guest players),
        isGuest: Boolean (auto-set based on presence of player),
        color: String
      }
    ],
    score: Number
  }
]

VALIDATION RULES:
----------------
✓ Must have exactly 2 teams
✓ Singles: 1 player per team
✓ Doubles: 2 players per team
✓ Each player must have EITHER 'player' (ObjectId) OR 'name' (String)
✓ isGuest flag is automatically set (true if no player ObjectId)

NEW VIRTUAL PROPERTIES:
----------------------
- registeredPlayers: Array of registered user ObjectIds
- guestPlayers: Array of guest player objects {name, color}

USAGE EXAMPLES:
==============

1. SINGLES MATCH - Registered User vs Guest Player
---------------------------------------------------
{
  "format": "single",
  "type": "friendly",
  "creator": "673c1234567890abcdef1234", // Registered user
  "location": "Downtown Court",
  "teams": [
    {
      "players": [
        {
          "player": "673c1234567890abcdef1234", // Registered user (creator)
          "color": "red"
        }
      ],
      "score": 0
    },
    {
      "players": [
        {
          "name": "John Doe", // Guest player (no player field)
          "color": "blue"
        }
      ],
      "score": 0
    }
  ]
}

2. SINGLES MATCH - Two Registered Users
---------------------------------------
{
  "format": "single",
  "type": "ranked",
  "creator": "673c1234567890abcdef1234",
  "location": "City Sports Center",
  "teams": [
    {
      "players": [
        {
          "player": "673c1234567890abcdef1234",
          "color": "red"
        }
      ]
    },
    {
      "players": [
        {
          "player": "673c9876543210fedcba5678",
          "color": "blue"
        }
      ]
    }
  ]
}

3. DOUBLES MATCH - Mixed (Registered + Guest Players)
-----------------------------------------------------
{
  "format": "double",
  "type": "friendly",
  "creator": "673c1234567890abcdef1234",
  "location": "Beach Court",
  "teams": [
    {
      "players": [
        {
          "player": "673c1234567890abcdef1234", // Registered (creator)
          "color": "red"
        },
        {
          "name": "Mike Smith", // Guest player
          "color": "orange"
        }
      ],
      "score": 0
    },
    {
      "players": [
        {
          "player": "673c9876543210fedcba5678", // Registered
          "color": "blue"
        },
        {
          "name": "Sarah Johnson", // Guest player
          "color": "green"
        }
      ],
      "score": 0
    }
  ]
}

4. DOUBLES MATCH - All Guest Players (except creator)
-----------------------------------------------------
{
  "format": "double",
  "type": "friendly",
  "creator": "673c1234567890abcdef1234",
  "location": "Community Center",
  "teams": [
    {
      "players": [
        {
          "player": "673c1234567890abcdef1234", // Registered (creator)
          "color": "red"
        },
        {
          "name": "Guest Partner", // Guest
          "color": "orange"
        }
      ]
    },
    {
      "players": [
        {
          "name": "Opponent 1", // Guest
          "color": "blue"
        },
        {
          "name": "Opponent 2", // Guest
          "color": "green"
        }
      ]
    }
  ]
}

INVALID EXAMPLES (Will throw errors):
=====================================

❌ Player with neither 'player' nor 'name':
{
  "players": [
    {
      "color": "red" // ERROR: Must have player OR name
    }
  ]
}

❌ Wrong number of players:
{
  "format": "single",
  "teams": [
    {
      "players": [
        {"player": "...", "color": "red"},
        {"name": "Guest", "color": "blue"} // ERROR: Singles needs 1 player/team
      ]
    }
  ]
}

API ENDPOINT USAGE:
==================

POST /api/v1/matches

Request Body (Singles with guest):
{
  "format": "single",
  "type": "friendly",
  "location": "Local Court",
  "teams": [
    {
      "players": [{"player": "USER_ID", "color": "red"}]
    },
    {
      "players": [{"name": "Guest Player", "color": "blue"}]
    }
  ]
}

Request Body (Doubles mixed):
{
  "format": "double",
  "type": "friendly",
  "location": "Sports Center",
  "teams": [
    {
      "players": [
        {"player": "USER_ID_1", "color": "red"},
        {"name": "Guest 1", "color": "orange"}
      ]
    },
    {
      "players": [
        {"player": "USER_ID_2", "color": "blue"},
        {"name": "Guest 2", "color": "green"}
      ]
    }
  ]
}

QUERYING MATCHES WITH GUEST PLAYERS:
====================================

// Get match with virtuals
const match = await Match.findById(matchId);

// Access registered players only
console.log(match.registeredPlayers); 
// Output: [ObjectId1, ObjectId2, ...]

// Access guest players only
console.log(match.guestPlayers);
// Output: [{name: "John Doe", color: "blue"}, ...]

// Check if player is guest
match.teams[0].players[0].isGuest; // true or false

BENEFITS:
========
✅ No need to create fake user accounts for guests
✅ No database bloat from temporary/guest users
✅ Simple name-based identification for casual matches
✅ Maintains data integrity with proper validation
✅ Backward compatible with existing registered user matches
✅ Can mix registered and guest players in same match
✅ Easy to identify and filter guest vs registered players

CONSIDERATIONS:
==============
⚠️  Guest players won't have profile data (stats, history, etc.)
⚠️  Guest players can't be looked up or referenced across matches
⚠️  Consider prompting users to register after playing as guest
⚠️  Analytics may need to handle guest players differently
⚠️  Leaderboards should only include registered users

MIGRATION:
=========
✓ Existing matches with registered players continue to work
✓ No database migration needed
✓ Schema is backward compatible
✓ New validation layer handles both cases

========================================
`);

// Example test data
const testCases = {
  singlesWithGuest: {
    format: "single",
    type: "friendly",
    location: "Test Court",
    teams: [
      {
        players: [{ player: "673c1234567890abcdef1234", color: "red" }]
      },
      {
        players: [{ name: "Guest Player", color: "blue" }]
      }
    ]
  },
  doublesAllGuests: {
    format: "double",
    type: "friendly",
    location: "Test Court",
    teams: [
      {
        players: [
          { player: "673c1234567890abcdef1234", color: "red" },
          { name: "Guest Partner", color: "orange" }
        ]
      },
      {
        players: [
          { name: "Guest Opponent 1", color: "blue" },
          { name: "Guest Opponent 2", color: "green" }
        ]
      }
    ]
  },
  doublesAllRegistered: {
    format: "double",
    type: "ranked",
    location: "Tournament Hall",
    teams: [
      {
        players: [
          { player: "673c1234567890abcdef1234", color: "red" },
          { player: "673c1234567890abcdef5678", color: "orange" }
        ]
      },
      {
        players: [
          { player: "673c9876543210fedcba1234", color: "blue" },
          { player: "673c9876543210fedcba5678", color: "green" }
        ]
      }
    ]
  }
};

console.log("\nTest Cases Object:");
console.log(JSON.stringify(testCases, null, 2));
