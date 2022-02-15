import { async } from 'regenerator-runtime';
import {
  API_URL,
  SPOONACULAR_URL,
  RES_PER_PAGE,
  KEY,
  SPOON_KEY,
} from './config.js';
import { AJAX } from './helpers.js';

export const state = {
  recipe: {},
  search: {
    query: '',
    results: [],
    page: 1,
    resultsPerPage: RES_PER_PAGE,
  },
  bookmarks: [],
};

const createRecipeObject = function (data) {
  const { recipe } = data.data;
  return {
    id: recipe.id,
    title: recipe.title,
    publisher: recipe.publisher,
    sourceUrl: recipe.source_url,
    image: recipe.image_url,
    servings: recipe.servings,
    cookingTime: recipe.cooking_time,
    ingredients: recipe.ingredients,
    ...(recipe.key && { key: recipe.key }),
  };
};

export const loadRecipe = async function (id) {
  try {
    const data = await AJAX(`${API_URL}${id}?key=${KEY}`);
    state.recipe = createRecipeObject(data);

    if (state.bookmarks.some(bookmark => bookmark.id === id))
      state.recipe.bookmarked = true;
    else state.recipe.bookmarked = false;
  } catch (err) {
    throw err;
  }
};

export const calculateCalories = async function () {
  try {
    // 1) Retrieve spoonacular API ingredient IDs and add attribute to ingredient list objects
    const ingredientIDs = state.recipe.ingredients.map(async ingObj => {
      const data = await AJAX(
        `${SPOONACULAR_URL}search?apiKey=${SPOON_KEY}&query=${ingObj.description}`
      );
      return { ...ingObj, id: data.results[0]?.id };
    });

    // 2) Iterate over ingredients to calculate total calories
    const calories = await ingredientIDs.reduce(
      async (total, ingPro) =>
        await retrieveIngredientCalories(await total, ingPro),
      0
    );

    state.recipe.calories = calories > 0 ? calories : undefined;
  } catch (err) {
    console.log('ERR');
    state.recipe.calories = undefined;
  }
};

const retrieveIngredientCalories = async function (total, ingPro) {
  try {
    const { id, quantity: amount, unit } = await ingPro.then(ingObj => ingObj);
    if (!id) return total;

    // Retrieve ingredient data from spoonacular API for specified ID, amount, and unit
    const data = await AJAX(
      `${SPOONACULAR_URL}${id}/information?apiKey=${SPOON_KEY}${
        amount ? `&amount=${amount}` : ''
      }${unit ? `&unit=${unit}` : ''}`
    );

    const ingCals = data.nutrition?.nutrients.filter(
      obj => obj.name === 'Calories'
    )[0].amount;

    return total + (ingCals || 0);
  } catch (err) {
    return total;
  }
};

export const loadSearchResults = async function (query) {
  try {
    state.search.query = query;
    const data = await AJAX(`${API_URL}?search=${query}&key=${KEY}`);

    state.search.results = data.data.recipes.map(recipe => {
      return {
        id: recipe.id,
        title: recipe.title,
        publisher: recipe.publisher,
        image: recipe.image_url,
        ...(recipe.key && { key: recipe.key }),
      };
    });
    state.search.page = 1;
  } catch (err) {
    throw err;
  }
};

export const getSearchResultsPage = function (page = state.search.page) {
  state.search.page = page;

  const start = (page - 1) * state.search.resultsPerPage;
  const end = page * state.search.resultsPerPage;

  return state.search.results.slice(start, end);
};

export const updateServings = function (newServings) {
  state.recipe.ingredients.forEach(ing => {
    ing.quantity *= newServings / state.recipe.servings;
  });

  state.recipe.calories *= newServings / state.recipe.servings;

  state.recipe.servings = newServings;
};

const persistBookmarks = function () {
  localStorage.setItem('bookmarks', JSON.stringify(state.bookmarks));
};

export const addBookmark = function (recipe) {
  // Add bookmark
  state.bookmarks.push(recipe);

  // Mark current recipe as bookmarked
  if (recipe.id === state.recipe.id) state.recipe.bookmarked = true;

  persistBookmarks();
};

export const deleteBookmark = function (id) {
  // Delete bookmark
  const index = state.bookmarks.findIndex(el => el.id === id);
  state.bookmarks.splice(index, 1);

  // Mark current recipe as NOT bookmarked
  if (state.recipe.id === id) state.recipe.bookmarked = false;

  persistBookmarks();
};

const init = function () {
  const storage = localStorage.getItem('bookmarks');
  if (storage) state.bookmarks = JSON.parse(storage);
};

const clearBookmarks = function () {
  localStorage.clear('bookmarks');
};

export const uploadRecipe = async function (newRecipe) {
  try {
    const ingredients = Object.entries(newRecipe)
      .filter(entry => entry[0].startsWith('ingredient') && entry[1] !== '')
      .map(ing => {
        const ingArr = ing[1].split(',').map(el => el.trim());
        if (ingArr.length !== 3)
          throw new Error(
            'Wrong ingredient format! Please use the correct format!'
          );

        const [quantity, unit, description] = ingArr;

        return { quantity: quantity ? +quantity : null, unit, description };
      });

    const recipe = {
      title: newRecipe.title,
      source_url: newRecipe.sourceUrl,
      image_url: newRecipe.image,
      publisher: newRecipe.publisher,
      cooking_time: +newRecipe.cookingTime,
      servings: +newRecipe.servings,
      ingredients,
    };

    const data = await AJAX(`${API_URL}?key=${KEY}`, recipe);
    state.recipe = createRecipeObject(data);
    addBookmark(state.recipe);
  } catch (err) {
    throw err;
  }
};

init();

// clearBookmarks();
