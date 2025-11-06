/**
 * Test User Search Functionality
 * 
 * This script demonstrates how to use the new search functionality
 * for the GET /api/v1/users endpoint.
 */

console.log(`
===========================================
USER SEARCH FUNCTIONALITY - USAGE GUIDE
===========================================

The user search endpoint has been enhanced with the following capabilities:

ENDPOINT: GET /api/v1/users

SEARCH PARAMETERS:
-----------------
1. searchTerm - Search across multiple user fields
   - Searches in: fullName, email, phone, description
   - Case-insensitive
   - Partial matches supported

2. Other filters - Can be combined with search
   - role (e.g., role=admin or role=user)
   - status (e.g., status=active)
   - verified (e.g., verified=true)
   - experienceLevel (e.g., experienceLevel=advanced)
   - Any other User model field

3. Standard query features still work:
   - Pagination: ?page=1&limit=10
   - Sorting: ?sort=createdAt or ?sort=-fullName
   - Field selection: ?fields=fullName,email,phone

USAGE EXAMPLES:
--------------

1. Search by name or email:
   GET /api/v1/users?searchTerm=john

2. Search combined with filters:
   GET /api/v1/users?searchTerm=john&role=admin

3. Search with pagination:
   GET /api/v1/users?searchTerm=smith&page=1&limit=20

4. Search with sorting:
   GET /api/v1/users?searchTerm=doe&sort=fullName

5. Search with field selection:
   GET /api/v1/users?searchTerm=test&fields=fullName,email,phone

6. Filter by status without search:
   GET /api/v1/users?status=active&verified=true

7. Complex example:
   GET /api/v1/users?searchTerm=john&role=user&status=active&sort=-createdAt&page=1&limit=10

SEARCHABLE FIELDS:
-----------------
- fullName: User's full name
- email: User's email address
- phone: User's phone number
- description: User's profile description

The search will match any of these fields (OR condition).
All searches are case-insensitive and support partial matches.

RESPONSE FORMAT:
---------------
{
  "status": "success",
  "message": "Users fetched successfully",
  "data": {
    "users": {
      "results": 5,           // Number of results in current page
      "totalPages": 2,        // Total number of pages
      "count": 15,            // Total matching documents
      "data": [...]           // Array of user objects
    }
  }
}

CURL EXAMPLES:
-------------

# Basic search
curl -H "Authorization: Bearer YOUR_TOKEN" "http://localhost:5000/api/v1/users?searchTerm=john"

# Search with filters
curl -H "Authorization: Bearer YOUR_TOKEN" "http://localhost:5000/api/v1/users?searchTerm=smith&role=admin"

# Search with pagination
curl -H "Authorization: Bearer YOUR_TOKEN" "http://localhost:5000/api/v1/users?searchTerm=test&page=1&limit=10"

IMPLEMENTATION DETAILS:
----------------------
Files modified:
- src/services/userService.js (added search configuration)
- src/utils/apiFeatures.js (added searchTerm to excluded items)

The search functionality uses MongoDB regex for flexible matching
and integrates seamlessly with existing filtering and pagination.

===========================================
`);

// Example test scenarios (pseudo-code for reference)
const testScenarios = {
  scenario1: {
    description: "Search users by name",
    endpoint: "/api/v1/users?searchTerm=john",
    expectedBehavior: "Returns all users where fullName, email, phone, or description contains 'john'"
  },
  scenario2: {
    description: "Search admin users only",
    endpoint: "/api/v1/users?searchTerm=admin&role=admin",
    expectedBehavior: "Returns admin users matching the search term"
  },
  scenario3: {
    description: "Search with pagination",
    endpoint: "/api/v1/users?searchTerm=test&page=2&limit=5",
    expectedBehavior: "Returns second page of search results with 5 users per page"
  }
};

console.log("Test Scenarios Object:", JSON.stringify(testScenarios, null, 2));
