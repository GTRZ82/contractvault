import "./App.css";
import { products } from "./data/products.js";

function App() {
  return (
    <main className="app">
      <header className="app-header">
        <h1>🛒 SwissCart</h1>
        <p>Compare. Save. Shop smarter.</p>
      </header>

      <section>
        <h2>Product Catalogue</h2>

        <p>{products.length} products available</p>

        <div className="product-grid">
          {products.map((product) => {
            const cheapestOffer = [...product.prices].sort(
              (firstOffer, secondOffer) =>
                firstOffer.price - secondOffer.price
            )[0];

            return (
              <article className="product-card" key={product.id}>
                <span className="product-emoji">
                  {product.emoji}
                </span>

                <p className="product-category">
                  {product.category}
                </p>

                <h3>
                  {product.brand} {product.name}
                </h3>

                <p className="product-variant">
                  {product.variant}
                </p>

                <p className="product-size">
                  {product.size} {product.unit}
                </p>

                {cheapestOffer ? (
                  <div className="product-price">
                    <strong>
                      From CHF {cheapestOffer.price.toFixed(2)}
                    </strong>

                    <span>at {cheapestOffer.store}</span>
                  </div>
                ) : (
                  <p>Price unavailable</p>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

export default App;