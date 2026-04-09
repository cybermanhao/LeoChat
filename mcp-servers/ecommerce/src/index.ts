import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ============================================================================
// Types
// ============================================================================

interface Product {
  id: string;
  name: string;
  brief: string;
  description: string;
  price: number;
  originalPrice?: number;
  category: string;
  brand: string;
  rating: number;
  reviewCount: number;
  stock: number;
  image: string;
  specs: Array<{ label: string; value: string }>;
  tags: string[];
}

interface CartItem {
  productId: string;
  quantity: number;
}

interface Order {
  id: string;
  items: Array<{ productId: string; name: string; price: number; quantity: number }>;
  total: number;
  status: "pending" | "paid" | "shipping" | "delivered";
  createdAt: number;
  trackingNo: string;
  carrier: string;
}

// ============================================================================
// Mock Product Catalog
// ============================================================================

const catalog: Product[] = [
  {
    id: "sony-xm5",
    name: "Sony WH-1000XM5",
    brief: "旗舰无线降噪耳机",
    description: "行业领先的自适应降噪，30小时超长续航，多点蓝牙连接，佩戴舒适轻量化设计",
    price: 2499,
    originalPrice: 2899,
    category: "电子产品/耳机",
    brand: "Sony",
    rating: 4.8,
    reviewCount: 2341,
    stock: 56,
    image: "https://picsum.photos/seed/sony-xm5/400/400",
    specs: [
      { label: "降噪", value: "自适应主动降噪" },
      { label: "续航", value: "30 小时" },
      { label: "连接", value: "蓝牙 5.2 / 3.5mm" },
      { label: "重量", value: "250g" },
    ],
    tags: ["热销", "限时优惠"],
  },
  {
    id: "airpods-pro2",
    name: "Apple AirPods Pro 2",
    brief: "主动降噪真无线耳机",
    description: "自适应音频，个性化空间音频，USB-C充电，MagSafe充电盒，IP54防水",
    price: 1799,
    originalPrice: 1899,
    category: "电子产品/耳机",
    brand: "Apple",
    rating: 4.7,
    reviewCount: 5621,
    stock: 128,
    image: "https://picsum.photos/seed/airpods-pro2/400/400",
    specs: [
      { label: "降噪", value: "自适应通透模式" },
      { label: "续航", value: "6h (盒30h)" },
      { label: "防水", value: "IP54" },
      { label: "芯片", value: "Apple H2" },
    ],
    tags: ["热销"],
  },
  {
    id: "galaxy-s24u",
    name: "Samsung Galaxy S24 Ultra",
    brief: "AI旗舰智能手机",
    description: "Galaxy AI 智能助手，2亿像素摄像头，S Pen内置，钛金属边框，骁龙8 Gen 3",
    price: 9699,
    category: "电子产品/手机",
    brand: "Samsung",
    rating: 4.6,
    reviewCount: 1893,
    stock: 23,
    image: "https://picsum.photos/seed/galaxy-s24u/400/400",
    specs: [
      { label: "处理器", value: "骁龙 8 Gen 3" },
      { label: "屏幕", value: "6.8\" QHD+ AMOLED 120Hz" },
      { label: "存储", value: "12GB + 256GB" },
      { label: "电池", value: "5000mAh" },
    ],
    tags: ["新品"],
  },
  {
    id: "ipad-air-m2",
    name: "iPad Air M2",
    brief: "轻薄高性能平板",
    description: "M2芯片驱动，11英寸Liquid Retina显示屏，支持Apple Pencil Pro和妙控键盘",
    price: 4799,
    category: "电子产品/平板",
    brand: "Apple",
    rating: 4.8,
    reviewCount: 3102,
    stock: 45,
    image: "https://picsum.photos/seed/ipad-air-m2/400/400",
    specs: [
      { label: "芯片", value: "Apple M2" },
      { label: "屏幕", value: "11\" Liquid Retina" },
      { label: "存储", value: "128GB" },
      { label: "重量", value: "462g" },
    ],
    tags: [],
  },
  {
    id: "mx-master3s",
    name: "Logitech MX Master 3S",
    brief: "高端无线办公鼠标",
    description: "8K DPI静音点击，MagSpeed电磁滚轮，多设备Flow切换，USB-C充电",
    price: 699,
    originalPrice: 799,
    category: "电子产品/外设",
    brand: "Logitech",
    rating: 4.9,
    reviewCount: 4520,
    stock: 200,
    image: "https://picsum.photos/seed/mx-master3s/400/400",
    specs: [
      { label: "DPI", value: "200-8000" },
      { label: "连接", value: "蓝牙 / USB接收器" },
      { label: "续航", value: "70 天" },
      { label: "按键", value: "7 个可编程" },
    ],
    tags: ["好评如潮", "限时优惠"],
  },
  {
    id: "dyson-v15",
    name: "Dyson V15 Detect",
    brief: "智能激光吸尘器",
    description: "激光探测微尘，LCD实时显示粒子计数，60分钟续航，整机HEPA过滤",
    price: 4990,
    category: "家电/清洁",
    brand: "Dyson",
    rating: 4.7,
    reviewCount: 876,
    stock: 15,
    image: "https://picsum.photos/seed/dyson-v15/400/400",
    specs: [
      { label: "吸力", value: "230 AW" },
      { label: "续航", value: "60 分钟" },
      { label: "容量", value: "0.76L" },
      { label: "过滤", value: "整机 HEPA" },
    ],
    tags: [],
  },
  {
    id: "mi-desklamp",
    name: "小米智能台灯 Pro",
    brief: "米家智能护眼台灯",
    description: "国AA级照度，无蓝光危害，支持米家/HomeKit，色温亮度无级调节",
    price: 249,
    category: "家居/照明",
    brand: "小米",
    rating: 4.6,
    reviewCount: 8930,
    stock: 500,
    image: "https://picsum.photos/seed/mi-desklamp/400/400",
    specs: [
      { label: "照度", value: "国AA级" },
      { label: "色温", value: "2700K-6500K" },
      { label: "连接", value: "Wi-Fi / 蓝牙" },
      { label: "功率", value: "14W" },
    ],
    tags: ["性价比"],
  },
  {
    id: "code-complete",
    name: "《代码大全》第二版",
    brief: "软件构造经典著作",
    description: "Steve McConnell著，涵盖软件构造核心技术，编程实践圣经，适合所有水平开发者",
    price: 128,
    category: "图书/技术",
    brand: "电子工业出版社",
    rating: 4.9,
    reviewCount: 12450,
    stock: 999,
    image: "https://picsum.photos/seed/code-complete/400/400",
    specs: [
      { label: "作者", value: "Steve McConnell" },
      { label: "页数", value: "960页" },
      { label: "ISBN", value: "978-7-121-02298-2" },
      { label: "版次", value: "第2版" },
    ],
    tags: ["经典", "好评如潮"],
  },
];

// ============================================================================
// State (per-process, single session for simplicity)
// ============================================================================

const cart: CartItem[] = [];
const orders: Order[] = [];
let orderSeq = 1;

// ============================================================================
// Helpers
// ============================================================================

function findProduct(id: string): Product | undefined {
  return catalog.find((p) => p.id === id);
}

function fmtPrice(price: number): string {
  return `¥${price.toLocaleString("zh-CN")}`;
}

function stars(rating: number): string {
  const full = Math.floor(rating);
  return "★".repeat(full) + (rating % 1 >= 0.5 ? "☆" : "") + ` ${rating}`;
}

function discountPct(orig: number, now: number): number {
  return Math.round((1 - now / orig) * 100);
}

function genTrackingNo(): string {
  return "SF" + Date.now().toString().slice(-10) + Math.floor(Math.random() * 100);
}

// ============================================================================
// Card Builders
// ============================================================================

function buildSearchResultCard(products: Product[], keyword: string): object {
  const body: unknown[] = [];

  if (products.length === 0) {
    body.push({ type: "text", text: `没有找到与"${keyword}"相关的商品`, format: "plain" });
    return {
      id: `search_${Date.now()}`,
      kind: "list",
      title: "🔍 搜索结果",
      subtitle: `"${keyword}" — 0 件商品`,
      tone: "default",
      body,
    };
  }

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (i > 0) body.push({ type: "divider" });

    body.push({ type: "image", image: { url: p.image, alt: p.name } });

    const fields: Array<{ label: string; value: string }> = [
      { label: "商品", value: `${p.name} — ${p.brief}` },
      { label: "价格", value: p.originalPrice ? `${fmtPrice(p.price)} (原价 ${fmtPrice(p.originalPrice)})` : fmtPrice(p.price) },
      { label: "评价", value: `${stars(p.rating)} (${p.reviewCount}条)` },
    ];
    body.push({ type: "fields", fields });

    const badges: unknown[] = [];
    for (const tag of p.tags) {
      const tone = tag.includes("优惠") ? "warning" : tag.includes("热销") ? "error" : tag.includes("新品") ? "info" : "success";
      badges.push({ type: "badge", badge: { text: tag, tone } });
    }
    if (p.stock <= 20) {
      badges.push({ type: "badge", badge: { text: `仅剩${p.stock}件`, tone: "warning" } });
    }
    body.push(...badges);
  }

  const actions = products.map((p, i) => ({
    id: `view_${i}`,
    label: `📋 ${p.name}`,
    kind: "secondary" as const,
    action: {
      type: "ui-command" as const,
      command: "send_message",
      payload: { text: `[product_detail productId="${p.id}"]` },
    },
  }));

  return {
    id: `search_${Date.now()}`,
    kind: "list",
    title: "🔍 搜索结果",
    subtitle: `"${keyword}" — ${products.length} 件商品`,
    tone: "info",
    body,
    actions,
  };
}

function buildProductDetailCard(p: Product): object {
  const body: unknown[] = [
    { type: "image", image: { url: p.image, alt: p.name } },
  ];

  const priceField = p.originalPrice
    ? `${fmtPrice(p.price)} (原价 ${fmtPrice(p.originalPrice)}, 省 ${fmtPrice(p.originalPrice - p.price)})`
    : fmtPrice(p.price);

  body.push({
    type: "fields",
    fields: [
      { label: "价格", value: priceField },
      { label: "品牌", value: p.brand },
      { label: "分类", value: p.category },
      { label: "评价", value: `${stars(p.rating)} (${p.reviewCount}条评价)` },
      { label: "库存", value: p.stock > 50 ? "现货充足" : p.stock > 0 ? `仅剩 ${p.stock} 件` : "暂时缺货" },
    ],
  });

  if (p.originalPrice) {
    body.push({ type: "badge", badge: { text: `限时优惠 -${discountPct(p.originalPrice, p.price)}%`, tone: "warning" } });
  }
  for (const tag of p.tags.filter((t) => !t.includes("优惠"))) {
    body.push({ type: "badge", badge: { text: tag, tone: "success" } });
  }

  body.push({ type: "divider" });
  body.push({ type: "text", text: "**产品规格**", format: "markdown" });
  body.push({ type: "fields", fields: p.specs });

  body.push({ type: "divider" });
  body.push({ type: "text", text: `**商品介绍**\n${p.description}`, format: "markdown" });

  const actions: unknown[] = [];
  if (p.stock > 0) {
    actions.push({
      id: "add_cart",
      label: "🛒 加入购物车",
      kind: "primary",
      action: {
        type: "ui-command",
        command: "send_message",
        payload: { text: `[cart_add productId="${p.id}"]` },
      },
    });
    actions.push({
      id: "buy_now",
      label: "⚡ 立即购买",
      kind: "primary",
      action: {
        type: "ui-command",
        command: "send_message",
        payload: { text: `[order_place productId="${p.id}"]` },
      },
    });
  }

  return {
    id: `product_${p.id}`,
    kind: "summary",
    title: p.name,
    subtitle: p.brief,
    tone: "default",
    body,
    actions,
  };
}

function buildCartCard(): object {
  if (cart.length === 0) {
    return {
      id: `cart_${Date.now()}`,
      kind: "summary",
      title: "🛒 购物车",
      subtitle: "空空如也",
      tone: "default",
      body: [
        { type: "text", text: "购物车还是空的，去逛逛吧！", format: "plain" },
      ],
      actions: [{
        id: "browse",
        label: "🔍 浏览商品",
        kind: "primary",
        action: {
          type: "ui-command",
          command: "send_message",
          payload: { text: `[product_search keyword="热门"]` },
        },
      }],
    };
  }

  const body: unknown[] = [];
  let total = 0;
  const removeActions: unknown[] = [];

  for (let i = 0; i < cart.length; i++) {
    const item = cart[i];
    const p = findProduct(item.productId);
    if (!p) continue;
    const subtotal = p.price * item.quantity;
    total += subtotal;

    if (i > 0) body.push({ type: "divider" });
    body.push({
      type: "fields",
      fields: [
        { label: "商品", value: p.name },
        { label: "单价", value: fmtPrice(p.price) },
        { label: "数量", value: `${item.quantity}` },
        { label: "小计", value: fmtPrice(subtotal) },
      ],
    });

    removeActions.push({
      id: `remove_${i}`,
      label: `移除 ${p.name}`,
      kind: "danger",
      action: {
        type: "ui-command",
        command: "send_message",
        payload: { text: `[cart_remove productId="${p.id}"]` },
      },
    });
  }

  body.push({ type: "divider" });

  const shipping = total >= 99 ? "免运费" : `¥10 (满¥99免运费)`;
  const finalTotal = total >= 99 ? total : total + 10;
  body.push({
    type: "fields",
    fields: [
      { label: "商品合计", value: fmtPrice(total) },
      { label: "运费", value: shipping },
      { label: "应付总额", value: fmtPrice(finalTotal) },
    ],
  });

  if (total < 99) {
    body.push({
      type: "progress",
      progress: { value: total, max: 99, label: `再购 ${fmtPrice(99 - total)} 享免运费` },
    });
  }

  body.push({
    type: "badge",
    badge: { text: `${cart.reduce((s, c) => s + c.quantity, 0)} 件商品`, tone: "info" },
  });

  const actions: unknown[] = [
    {
      id: "checkout",
      label: "💳 结算下单",
      kind: "primary",
      action: {
        type: "ui-command",
        command: "send_message",
        payload: { text: "[order_place]" },
      },
    },
    ...removeActions,
  ];

  return {
    id: `cart_${Date.now()}`,
    kind: "summary",
    title: "🛒 购物车",
    subtitle: `${cart.reduce((s, c) => s + c.quantity, 0)} 件商品`,
    tone: "info",
    body,
    actions,
  };
}

function buildOrderCard(order: Order): object {
  const statusMap = {
    pending: { label: "待付款", tone: "warning" as const, step: 1 },
    paid: { label: "已付款·待发货", tone: "info" as const, step: 2 },
    shipping: { label: "运输中", tone: "info" as const, step: 3 },
    delivered: { label: "已签收", tone: "success" as const, step: 4 },
  };
  const s = statusMap[order.status];

  const body: unknown[] = [];

  // Order items
  const itemFields = order.items.map((it) => ({
    label: `${it.name} x${it.quantity}`,
    value: fmtPrice(it.price * it.quantity),
  }));
  itemFields.push({ label: "订单总额", value: fmtPrice(order.total) });
  body.push({ type: "fields", fields: itemFields });

  body.push({ type: "divider" });

  // Status info
  const statusFields: Array<{ label: string; value: string }> = [
    { label: "订单状态", value: s.label },
    { label: "下单时间", value: new Date(order.createdAt).toLocaleString("zh-CN") },
  ];
  if (order.status === "shipping" || order.status === "delivered") {
    statusFields.push({ label: "承运商", value: order.carrier });
    statusFields.push({ label: "运单号", value: order.trackingNo });
  }
  body.push({ type: "fields", fields: statusFields });

  // Progress bar: 4 steps
  body.push({
    type: "progress",
    progress: {
      value: s.step,
      max: 4,
      label: ["", "下单 → 待付款", "已付款 → 等待发货", "已发货 → 运输中", "已签收 ✓"][s.step],
    },
  });

  body.push({ type: "badge", badge: { text: s.label, tone: s.tone } });

  // Actions based on status
  const actions: unknown[] = [];
  if (order.status === "pending") {
    actions.push({
      id: "pay",
      label: "💳 去付款",
      kind: "primary",
      action: {
        type: "ui-command",
        command: "send_message",
        payload: { text: `[order_pay orderId="${order.id}"]` },
      },
    });
  }
  if (order.status === "paid" || order.status === "shipping") {
    actions.push({
      id: "track",
      label: "📦 刷新物流",
      kind: "secondary",
      action: {
        type: "ui-command",
        command: "send_message",
        payload: { text: `[order_status orderId="${order.id}"]` },
      },
    });
  }

  return {
    id: `order_${order.id}`,
    kind: "status",
    title: `📦 订单 #${order.id}`,
    subtitle: s.label,
    tone: s.tone,
    body,
    actions,
  };
}

function buildAddedToCartCard(p: Product, quantity: number): object {
  const cartCount = cart.reduce((s, c) => s + c.quantity, 0);
  return {
    id: `cart_added_${Date.now()}`,
    kind: "summary",
    title: "✅ 已加入购物车",
    tone: "success",
    body: [
      { type: "image", image: { url: p.image, alt: p.name } },
      {
        type: "fields",
        fields: [
          { label: "商品", value: p.name },
          { label: "数量", value: `+${quantity}` },
          { label: "单价", value: fmtPrice(p.price) },
        ],
      },
      { type: "badge", badge: { text: `购物车共 ${cartCount} 件`, tone: "info" } },
    ],
    actions: [
      {
        id: "view_cart",
        label: "🛒 查看购物车",
        kind: "primary",
        action: {
          type: "ui-command",
          command: "send_message",
          payload: { text: "[cart_view]" },
        },
      },
      {
        id: "continue",
        label: "继续购物 🔍",
        kind: "secondary",
        action: {
          type: "ui-command",
          command: "send_message",
          payload: { text: `[product_search keyword="推荐"]` },
        },
      },
    ],
  };
}

// ============================================================================
// Search logic
// ============================================================================

function searchProducts(keyword?: string, category?: string, sort?: string): Product[] {
  let results = [...catalog];

  if (keyword) {
    const kw = keyword.toLowerCase();
    // "热门" / "推荐" => return all, sorted by reviews
    if (kw === "热门" || kw === "推荐" || kw === "popular" || kw === "all") {
      results.sort((a, b) => b.reviewCount - a.reviewCount);
      return results;
    }
    results = results.filter((p) =>
      p.name.toLowerCase().includes(kw) ||
      p.brief.includes(kw) ||
      p.brand.toLowerCase().includes(kw) ||
      p.category.includes(kw) ||
      p.tags.some((t) => t.includes(kw)) ||
      p.description.includes(kw)
    );
  }

  if (category) {
    const cat = category.toLowerCase();
    results = results.filter((p) => p.category.toLowerCase().includes(cat));
  }

  switch (sort) {
    case "price_asc":
      results.sort((a, b) => a.price - b.price);
      break;
    case "price_desc":
      results.sort((a, b) => b.price - a.price);
      break;
    case "rating":
      results.sort((a, b) => b.rating - a.rating);
      break;
    default:
      results.sort((a, b) => b.reviewCount - a.reviewCount);
  }

  return results;
}

// ============================================================================
// MCP Server
// ============================================================================

const server = new Server(
  { name: "ecommerce", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

const CARD_NOTE = "Returns a LeoCard JSON. Present the card to the user.";

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "product_search",
      description: `搜索商品。${CARD_NOTE}`,
      inputSchema: {
        type: "object",
        properties: {
          keyword: { type: "string", description: "搜索关键词（商品名/品牌/分类），留空或传 '推荐' 显示全部" },
          category: { type: "string", description: "分类过滤，如 '耳机'、'手机'、'家电'" },
          sort: { type: "string", enum: ["popular", "price_asc", "price_desc", "rating"], description: "排序方式" },
        },
      },
    },
    {
      name: "product_detail",
      description: `查看商品详情。${CARD_NOTE}`,
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "string", description: "商品ID" },
        },
        required: ["productId"],
      },
    },
    {
      name: "cart_add",
      description: `加入购物车。${CARD_NOTE}`,
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "string", description: "商品ID" },
          quantity: { type: "number", description: "数量，默认1" },
        },
        required: ["productId"],
      },
    },
    {
      name: "cart_view",
      description: `查看购物车。${CARD_NOTE}`,
      inputSchema: { type: "object", properties: {} },
    },
    {
      name: "cart_remove",
      description: `从购物车移除商品。${CARD_NOTE}`,
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "string", description: "要移除的商品ID" },
        },
        required: ["productId"],
      },
    },
    {
      name: "order_place",
      description: `下单。不传 productId 则从购物车结算，传 productId 则直接购买该商品。${CARD_NOTE}`,
      inputSchema: {
        type: "object",
        properties: {
          productId: { type: "string", description: "直接购买的商品ID（可选，不传则结算购物车）" },
        },
      },
    },
    {
      name: "order_pay",
      description: `模拟付款。${CARD_NOTE}`,
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "订单号" },
        },
        required: ["orderId"],
      },
    },
    {
      name: "order_status",
      description: `查看订单状态和物流信息。${CARD_NOTE}`,
      inputSchema: {
        type: "object",
        properties: {
          orderId: { type: "string", description: "订单号" },
        },
        required: ["orderId"],
      },
    },
  ],
}));

const makeError = (msg: string) => ({
  content: [{ type: "text" as const, text: msg }],
  isError: true,
});

const cardResult = (card: object, instruction?: string) => ({
  content: [
    { type: "text" as const, text: JSON.stringify(card) },
    ...(instruction ? [{ type: "text" as const, text: instruction }] : []),
  ],
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    // ------------------------------------------------------------------
    case "product_search": {
      const { keyword, category, sort } = (args ?? {}) as {
        keyword?: string; category?: string; sort?: string;
      };
      const results = searchProducts(keyword, category, sort);
      const card = buildSearchResultCard(results, keyword || category || "推荐");
      return cardResult(card, `共找到 ${results.length} 件商品。请展示上方商品卡片，简要介绍搜索结果。`);
    }

    // ------------------------------------------------------------------
    case "product_detail": {
      const { productId } = (args ?? {}) as { productId?: string };
      if (!productId) return makeError("缺少 productId");
      const p = findProduct(productId);
      if (!p) return makeError(`未找到商品: ${productId}`);
      const card = buildProductDetailCard(p);
      return cardResult(card, `请展示商品卡片，并简要推荐这个商品的亮点。`);
    }

    // ------------------------------------------------------------------
    case "cart_add": {
      const { productId, quantity = 1 } = (args ?? {}) as { productId?: string; quantity?: number };
      if (!productId) return makeError("缺少 productId");
      const p = findProduct(productId);
      if (!p) return makeError(`未找到商品: ${productId}`);
      if (p.stock <= 0) return makeError(`商品 ${p.name} 已售罄`);

      const existing = cart.find((c) => c.productId === productId);
      if (existing) {
        existing.quantity += quantity;
      } else {
        cart.push({ productId, quantity });
      }

      const card = buildAddedToCartCard(p, quantity);
      return cardResult(card);
    }

    // ------------------------------------------------------------------
    case "cart_view": {
      const card = buildCartCard();
      return cardResult(card);
    }

    // ------------------------------------------------------------------
    case "cart_remove": {
      const { productId } = (args ?? {}) as { productId?: string };
      if (!productId) return makeError("缺少 productId");
      const idx = cart.findIndex((c) => c.productId === productId);
      if (idx === -1) return makeError("该商品不在购物车中");
      const p = findProduct(cart[idx].productId);
      cart.splice(idx, 1);
      const card = buildCartCard();
      return cardResult(card, `已移除 ${p?.name || productId}。`);
    }

    // ------------------------------------------------------------------
    case "order_place": {
      const { productId } = (args ?? {}) as { productId?: string };

      let orderItems: Order["items"] = [];

      if (productId) {
        // Direct buy
        const p = findProduct(productId);
        if (!p) return makeError(`未找到商品: ${productId}`);
        if (p.stock <= 0) return makeError(`商品 ${p.name} 已售罄`);
        orderItems = [{ productId: p.id, name: p.name, price: p.price, quantity: 1 }];
      } else {
        // Cart checkout
        if (cart.length === 0) return makeError("购物车为空，请先添加商品");
        for (const item of cart) {
          const p = findProduct(item.productId);
          if (p) {
            orderItems.push({ productId: p.id, name: p.name, price: p.price, quantity: item.quantity });
          }
        }
        cart.length = 0; // Clear cart
      }

      const total = orderItems.reduce((s, it) => s + it.price * it.quantity, 0);
      const order: Order = {
        id: `${20240100 + orderSeq++}`,
        items: orderItems,
        total: total >= 99 ? total : total + 10,
        status: "pending",
        createdAt: Date.now(),
        trackingNo: genTrackingNo(),
        carrier: "顺丰速运",
      };
      orders.push(order);

      const card = buildOrderCard(order);
      return cardResult(card, `订单已创建，请展示订单卡片并提示用户付款。`);
    }

    // ------------------------------------------------------------------
    case "order_pay": {
      const { orderId } = (args ?? {}) as { orderId?: string };
      if (!orderId) return makeError("缺少 orderId");
      const order = orders.find((o) => o.id === orderId);
      if (!order) return makeError(`未找到订单: ${orderId}`);
      if (order.status !== "pending") return makeError("该订单已付款");

      // Simulate: pay -> shipping (instant for demo)
      order.status = "shipping";
      const card = buildOrderCard(order);
      return cardResult(card, `付款成功！商品已发货。请展示物流卡片。`);
    }

    // ------------------------------------------------------------------
    case "order_status": {
      const { orderId } = (args ?? {}) as { orderId?: string };
      if (!orderId) return makeError("缺少 orderId");
      const order = orders.find((o) => o.id === orderId);
      if (!order) return makeError(`未找到订单: ${orderId}`);

      // Simulate progress: after 10s shipping -> delivered
      if (order.status === "shipping" && Date.now() - order.createdAt > 10_000) {
        order.status = "delivered";
      }
      const card = buildOrderCard(order);
      return cardResult(card);
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// ============================================================================
// Start
// ============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("E-commerce MCP Server running on stdio");
}

main().catch(console.error);
