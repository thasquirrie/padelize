class APIFeatures {
  constructor(query, queryString) {
    this.query = query;
    this.queryString = queryString;
  }

  filter() {
    const queryObj = { ...this.queryString };

    const excludedItems = [
      'sort',
      'page',
      'limit',
      'fields',
      'search',
      'searchTerm',
    ];
    excludedItems.forEach((el) => {
      console.log(queryObj[el]);
      delete queryObj[el];
    });

    if (queryObj.$and) {
      // Apply the exclusions to each condition in the $and array
      queryObj.$and = queryObj.$and.map((condition) => {
        const filteredCondition = { ...condition };
        excludedItems.forEach((el) => delete filteredCondition[el]);
        return filteredCondition;
      });
    }
    // console.log('Query Obj', { ...queryObj });

    // Advance Querying
    let queryStr = JSON.stringify(queryObj);
    queryStr = queryStr.replace(/\b(gte|gt|lt|lte)\b/g, (match) => `$${match}`);

    console.log({ queryStr });

    const parsedQuery = JSON.parse(queryStr);
    console.log({ parsedQuery });

    this.query = this.query.find(parsedQuery);

    // console.log('Query:', this.query);
    return this;
  }

  sort() {
    if (this.queryString.sort) {
      const sortBy = this.queryString.sort.split(',').join(' ');
      console.log('sortBy is:', sortBy);
      this.query = this.query.sort(sortBy);
    } else {
      this.query = this.query.sort('-createdAt');
    }

    return this;
  }

  limitFields() {
    if (this.queryString.fields) {
      const fields = this.queryString.fields.split(',').join(' ');
      this.query = this.query.select(fields);
    }

    return this;
  }

  paginate() {
    const limit = Number(this.queryString.limit) || 20;
    const page = Number(this.queryString.page) || 1;
    const skip = (page - 1) * limit;

    this.query = this.query.skip(skip).limit(limit);

    console.log({ limit, page, skip });

    return this;
  }
}

export default APIFeatures;
