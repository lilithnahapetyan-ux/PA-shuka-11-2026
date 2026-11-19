import { BrowserRouter, Route, Routes } from 'react-router';
import { LangProvider } from './i18n.jsx';
import { SessionProvider } from './session.jsx';
import { Layout, SellerLayout } from './components/Layout.jsx';
import { RequireAuth, RequireSeller } from './components/Guards.jsx';
import Home from './pages/Home.jsx';
import Search from './pages/Search.jsx';
import Product from './pages/Product.jsx';
import Cart from './pages/Cart.jsx';
import Checkout from './pages/Checkout.jsx';
import { OrderDetail, OrderList } from './pages/Orders.jsx';
import { Account, BecomeSeller, Login, NotFound, Register } from './pages/Auth.jsx';
import Overview from './pages/seller/Overview.jsx';
import Products from './pages/seller/Products.jsx';
import ProductEditor from './pages/seller/ProductEditor.jsx';
import { SellerOrderDetail, SellerOrders } from './pages/seller/Orders.jsx';

export default function App() {
  return (
    <LangProvider>
      <SessionProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Home />} />
              <Route path="search" element={<Search />} />
              <Route path="products/:id" element={<Product />} />
              <Route path="login" element={<Login />} />
              <Route path="register" element={<Register />} />

              <Route element={<RequireAuth />}>
                <Route path="cart" element={<Cart />} />
                <Route path="checkout" element={<Checkout />} />
                <Route path="orders" element={<OrderList />} />
                <Route path="orders/:id" element={<OrderDetail />} />
                <Route path="account" element={<Account />} />
                <Route path="sell" element={<BecomeSeller />} />
              </Route>

              <Route path="seller" element={<RequireSeller />}>
                <Route element={<SellerLayout />}>
                  <Route index element={<Overview />} />
                  <Route path="products" element={<Products />} />
                  <Route path="products/new" element={<ProductEditor key="new" />} />
                  <Route path="products/:id" element={<ProductEditor />} />
                  <Route path="orders" element={<SellerOrders />} />
                  <Route path="orders/:id" element={<SellerOrderDetail />} />
                </Route>
              </Route>

              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SessionProvider>
    </LangProvider>
  );
}
