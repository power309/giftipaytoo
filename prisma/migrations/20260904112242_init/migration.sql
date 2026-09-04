-- CreateEnum
CREATE TYPE "public"."UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION', 'DELETED');

-- CreateEnum
CREATE TYPE "public"."ActorType" AS ENUM ('USER', 'STAFF', 'SYSTEM', 'API');

-- CreateEnum
CREATE TYPE "public"."VerificationChannel" AS ENUM ('EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "public"."VerificationPurpose" AS ENUM ('EMAIL_VERIFY', 'PHONE_VERIFY', 'PASSWORD_RESET', 'LOGIN_2FA', 'ORDER_CONFIRM');

-- CreateEnum
CREATE TYPE "public"."ProductStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'SCHEDULED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."ProductType" AS ENUM ('GIFT_CARD', 'SUBSCRIPTION', 'GAME_CURRENCY', 'MOBILE_TOPUP', 'SOFTWARE_LICENSE', 'ACCOUNT_TOPUP', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."DeliveryType" AS ENUM ('INSTANT_CODE', 'MANUAL_CODE', 'ACCOUNT_TOPUP', 'SUPPLIER_API');

-- CreateEnum
CREATE TYPE "public"."MediaKind" AS ENUM ('POSTER', 'GALLERY', 'BANNER_DESKTOP', 'BANNER_MOBILE', 'LOGO', 'OG_IMAGE');

-- CreateEnum
CREATE TYPE "public"."MarginType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "public"."RoundingMode" AS ENUM ('NONE', 'UP', 'DOWN', 'NEAREST');

-- CreateEnum
CREATE TYPE "public"."PricingScope" AS ENUM ('GLOBAL', 'CATEGORY', 'BRAND', 'PRODUCT', 'VARIANT', 'SUPPLIER', 'CUSTOMER_GROUP');

-- CreateEnum
CREATE TYPE "public"."RateSource" AS ENUM ('MANUAL', 'API', 'IMPORT');

-- CreateEnum
CREATE TYPE "public"."ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'AUTO_APPLIED');

-- CreateEnum
CREATE TYPE "public"."CouponType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "public"."InventoryStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD', 'INVALID', 'REFUNDED', 'EXPIRED', 'QUARANTINED');

-- CreateEnum
CREATE TYPE "public"."BatchStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "public"."OrderStatus" AS ENUM ('PENDING', 'AWAITING_PAYMENT', 'PAID', 'UNDER_REVIEW', 'PROCESSING', 'COMPLETED', 'PARTIALLY_FULFILLED', 'CANCELED', 'EXPIRED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'VERIFICATION_FAILED', 'CANCELED', 'EXPIRED', 'REFUNDED', 'PARTIALLY_REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."FulfillmentStatus" AS ENUM ('UNFULFILLED', 'RESERVED', 'PARTIALLY_FULFILLED', 'FULFILLED', 'FAILED', 'MANUAL_REVIEW');

-- CreateEnum
CREATE TYPE "public"."RefundStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."WalletTxType" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "public"."ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "public"."TicketStatus" AS ENUM ('OPEN', 'PENDING_CUSTOMER', 'PENDING_STAFF', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "public"."TicketPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "public"."NotificationChannel" AS ENUM ('EMAIL', 'SMS', 'IN_APP', 'WEBPUSH');

-- CreateEnum
CREATE TYPE "public"."NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "public"."JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "public"."DeliveryChannel" AS ENUM ('ACCOUNT', 'EMAIL', 'SMS');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "phone" TEXT,
    "phoneVerifiedAt" TIMESTAMP(3),
    "passwordHash" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "nationalId" TEXT,
    "status" "public"."UserStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "isStaff" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "walletBalance" INTEGER NOT NULL DEFAULT 0,
    "loyaltyPoints" INTEGER NOT NULL DEFAULT 0,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorSecret" TEXT,
    "twoFactorBackup" TEXT,
    "referralCode" TEXT,
    "referredById" TEXT,
    "customerGroupId" TEXT,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "lastLoginIp" TEXT,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "deviceLabel" TEXT,
    "isStaffScope" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorOk" BOOLEAN NOT NULL DEFAULT false,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."verification_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "identifier" TEXT NOT NULL,
    "channel" "public"."VerificationChannel" NOT NULL,
    "purpose" "public"."VerificationPurpose" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."roles" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."permissions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "public"."user_roles" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "public"."customer_groups" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "description" TEXT,
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    "isReseller" BOOLEAN NOT NULL DEFAULT false,
    "minSpendToman" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."addresses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "province" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "postalCode" TEXT,
    "line1" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "nameEn" TEXT,
    "descriptionFa" TEXT,
    "iconKey" TEXT,
    "posterKey" TEXT,
    "bannerKey" TEXT,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "showInMegaMenu" BOOLEAN NOT NULL DEFAULT true,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."brands" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "descriptionFa" TEXT,
    "logoKey" TEXT,
    "bannerKey" TEXT,
    "accentColor" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."platforms" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "iconKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "platforms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."regions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "flagEmoji" TEXT,
    "currencyCode" TEXT,
    "notesFa" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."currencies" (
    "code" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "minorUnits" INTEGER NOT NULL DEFAULT 2,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "public"."tags" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."products" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "nameEn" TEXT,
    "brandId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "platformId" TEXT,
    "productType" "public"."ProductType" NOT NULL DEFAULT 'GIFT_CARD',
    "deliveryType" "public"."DeliveryType" NOT NULL DEFAULT 'INSTANT_CODE',
    "status" "public"."ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "shortDescriptionFa" TEXT,
    "descriptionFa" TEXT,
    "activationGuideFa" TEXT,
    "restrictionsFa" TEXT,
    "warningsFa" TEXT,
    "refundEligible" BOOLEAN NOT NULL DEFAULT false,
    "refundPolicyFa" TEXT,
    "requiresRegionAck" BOOLEAN NOT NULL DEFAULT true,
    "estimatedDeliveryMin" INTEGER NOT NULL DEFAULT 5,
    "minOrderQty" INTEGER NOT NULL DEFAULT 1,
    "maxOrderQty" INTEGER NOT NULL DEFAULT 10,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isPopular" BOOLEAN NOT NULL DEFAULT false,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "searchKeywords" TEXT,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "salesCount" INTEGER NOT NULL DEFAULT 0,
    "ratingAvg" INTEGER NOT NULL DEFAULT 0,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "publishAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."product_tags" (
    "productId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "product_tags_pkey" PRIMARY KEY ("productId","tagId")
);

-- CreateTable
CREATE TABLE "public"."product_relations" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'RELATED',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_relations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."product_media" (
    "id" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "kind" "public"."MediaKind" NOT NULL DEFAULT 'GALLERY',
    "path" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "format" TEXT,
    "blurData" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."product_variants" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "denominationMinor" INTEGER,
    "currencyCode" TEXT,
    "regionId" TEXT,
    "platformId" TEXT,
    "costPriceToman" INTEGER NOT NULL DEFAULT 0,
    "basePriceToman" INTEGER NOT NULL DEFAULT 0,
    "salePriceToman" INTEGER,
    "compareAtToman" INTEGER,
    "marginType" "public"."MarginType" NOT NULL DEFAULT 'PERCENT',
    "marginValue" INTEGER NOT NULL DEFAULT 0,
    "minProfitToman" INTEGER NOT NULL DEFAULT 0,
    "autoPrice" BOOLEAN NOT NULL DEFAULT true,
    "priceUpdatedAt" TIMESTAMP(3),
    "minQty" INTEGER NOT NULL DEFAULT 1,
    "maxQty" INTEGER NOT NULL DEFAULT 10,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "supplierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."bulk_price_tiers" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "minQty" INTEGER NOT NULL,
    "unitPriceToman" INTEGER NOT NULL,

    CONSTRAINT "bulk_price_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."exchange_rates" (
    "id" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "tomanPerUnit" INTEGER NOT NULL,
    "source" "public"."RateSource" NOT NULL DEFAULT 'MANUAL',
    "sourceRef" TEXT,
    "note" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."pricing_rules" (
    "id" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "scope" "public"."PricingScope" NOT NULL DEFAULT 'GLOBAL',
    "targetId" TEXT,
    "customerGroupId" TEXT,
    "marginType" "public"."MarginType" NOT NULL DEFAULT 'PERCENT',
    "marginValue" INTEGER NOT NULL DEFAULT 0,
    "minProfitToman" INTEGER NOT NULL DEFAULT 0,
    "roundingMode" "public"."RoundingMode" NOT NULL DEFAULT 'NEAREST',
    "roundingStep" INTEGER NOT NULL DEFAULT 1000,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pricing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."price_history" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "oldPriceToman" INTEGER NOT NULL,
    "newPriceToman" INTEGER NOT NULL,
    "oldCostToman" INTEGER,
    "newCostToman" INTEGER,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."price_change_approvals" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "currentToman" INTEGER NOT NULL,
    "proposedToman" INTEGER NOT NULL,
    "deltaPercent" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "public"."ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT,
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_change_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."coupons" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "type" "public"."CouponType" NOT NULL DEFAULT 'PERCENT',
    "value" INTEGER NOT NULL,
    "maxDiscountToman" INTEGER,
    "minOrderToman" INTEGER NOT NULL DEFAULT 0,
    "usageLimit" INTEGER,
    "perUserLimit" INTEGER NOT NULL DEFAULT 1,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "scope" "public"."PricingScope" NOT NULL DEFAULT 'GLOBAL',
    "targetId" TEXT,
    "customerGroupId" TEXT,
    "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."coupon_redemptions" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "userId" TEXT,
    "orderId" TEXT,
    "discountToman" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."campaigns" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "descriptionFa" TEXT,
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    "bannerDesktop" TEXT,
    "bannerMobile" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."campaign_products" (
    "campaignId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,

    CONSTRAINT "campaign_products_pkey" PRIMARY KEY ("campaignId","productId")
);

-- CreateTable
CREATE TABLE "public"."suppliers" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "adapterKey" TEXT NOT NULL DEFAULT 'manual',
    "apiBaseUrl" TEXT,
    "credentialsEncrypted" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "autoFulfill" BOOLEAN NOT NULL DEFAULT false,
    "reliabilityScore" INTEGER NOT NULL DEFAULT 100,
    "notesFa" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."inventory_batches" (
    "id" TEXT NOT NULL,
    "variantId" TEXT,
    "supplierId" TEXT,
    "fileName" TEXT,
    "importedById" TEXT,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "status" "public"."BatchStatus" NOT NULL DEFAULT 'PENDING',
    "errorLog" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "inventory_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."inventory_items" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "supplierId" TEXT,
    "batchId" TEXT,
    "codeCipher" TEXT NOT NULL,
    "codeFingerprint" TEXT NOT NULL,
    "codeMask" TEXT NOT NULL,
    "serialCipher" TEXT,
    "pinCipher" TEXT,
    "status" "public"."InventoryStatus" NOT NULL DEFAULT 'AVAILABLE',
    "costToman" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "reservedUntil" TIMESTAMP(3),
    "reservedForOrderId" TEXT,
    "orderItemId" TEXT,
    "soldAt" TIMESTAMP(3),
    "notes" TEXT,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."inventory_audit_logs" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" "public"."ActorType" NOT NULL DEFAULT 'SYSTEM',
    "ip" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."stock_alerts" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "threshold" INTEGER NOT NULL DEFAULT 5,
    "lastNotifiedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "stock_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."carts" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionKey" TEXT NOT NULL,
    "couponCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."cart_items" (
    "id" TEXT NOT NULL,
    "cartId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unitPriceToman" INTEGER NOT NULL,
    "regionAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."orders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "userId" TEXT,
    "guestEmail" TEXT,
    "guestPhone" TEXT,
    "status" "public"."OrderStatus" NOT NULL DEFAULT 'PENDING',
    "paymentStatus" "public"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "fulfillmentStatus" "public"."FulfillmentStatus" NOT NULL DEFAULT 'UNFULFILLED',
    "subtotalToman" INTEGER NOT NULL DEFAULT 0,
    "discountToman" INTEGER NOT NULL DEFAULT 0,
    "taxToman" INTEGER NOT NULL DEFAULT 0,
    "feeToman" INTEGER NOT NULL DEFAULT 0,
    "walletAppliedToman" INTEGER NOT NULL DEFAULT 0,
    "totalToman" INTEGER NOT NULL DEFAULT 0,
    "costTotalToman" INTEGER NOT NULL DEFAULT 0,
    "couponId" TEXT,
    "couponCode" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "riskScore" INTEGER NOT NULL DEFAULT 0,
    "riskFlags" JSONB,
    "needsReview" BOOLEAN NOT NULL DEFAULT false,
    "notesInternal" TEXT,
    "notesCustomer" TEXT,
    "termsAcceptedAt" TIMESTAMP(3),
    "regionAckAt" TIMESTAMP(3),
    "reservationExpiresAt" TIMESTAMP(3),
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."order_items" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "variantId" TEXT,
    "productNameFa" TEXT NOT NULL,
    "variantNameFa" TEXT NOT NULL,
    "productSlug" TEXT NOT NULL,
    "posterPath" TEXT,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "unitPriceToman" INTEGER NOT NULL,
    "unitCostToman" INTEGER NOT NULL DEFAULT 0,
    "lineTotalToman" INTEGER NOT NULL,
    "fulfilledQty" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."order_status_history" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT NOT NULL,
    "field" TEXT NOT NULL DEFAULT 'status',
    "note" TEXT,
    "actorId" TEXT,
    "actorType" "public"."ActorType" NOT NULL DEFAULT 'SYSTEM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."payments" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "gateway" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'sandbox',
    "amountToman" INTEGER NOT NULL,
    "status" "public"."PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "authority" TEXT,
    "refId" TEXT,
    "cardPanMasked" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "requestPayload" JSONB,
    "verifyPayload" JSONB,
    "failureReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."refunds" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentId" TEXT,
    "amountToman" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'WALLET',
    "status" "public"."RefundStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedById" TEXT,
    "approvedById" TEXT,
    "adminNote" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."deliveries" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "inventoryItemId" TEXT,
    "channel" "public"."DeliveryChannel" NOT NULL DEFAULT 'ACCOUNT',
    "deliveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "firstRevealedAt" TIMESTAMP(3),
    "revealCount" INTEGER NOT NULL DEFAULT 0,
    "resendCount" INTEGER NOT NULL DEFAULT 0,
    "isReplacement" BOOLEAN NOT NULL DEFAULT false,
    "replacedDeliveryId" TEXT,
    "note" TEXT,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."invoices" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."wallet_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "public"."WalletTxType" NOT NULL,
    "amountToman" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "orderId" TEXT,
    "actorId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."loyalty_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loyalty_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."pages" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleFa" TEXT NOT NULL,
    "contentFa" TEXT NOT NULL,
    "excerptFa" TEXT,
    "status" "public"."ContentStatus" NOT NULL DEFAULT 'PUBLISHED',
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "showInFooter" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."blog_posts" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "titleFa" TEXT NOT NULL,
    "excerptFa" TEXT NOT NULL,
    "contentFa" TEXT NOT NULL,
    "coverPath" TEXT,
    "coverAlt" TEXT,
    "authorId" TEXT,
    "categoryFa" TEXT,
    "tags" TEXT,
    "readingMinutes" INTEGER NOT NULL DEFAULT 3,
    "status" "public"."ContentStatus" NOT NULL DEFAULT 'PUBLISHED',
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "publishedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blog_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."faqs" (
    "id" TEXT NOT NULL,
    "questionFa" TEXT NOT NULL,
    "answerFa" TEXT NOT NULL,
    "categoryId" TEXT,
    "productId" TEXT,
    "group" TEXT NOT NULL DEFAULT 'general',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faqs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."banners" (
    "id" TEXT NOT NULL,
    "titleFa" TEXT NOT NULL,
    "subtitleFa" TEXT,
    "ctaLabel" TEXT,
    "href" TEXT,
    "imageDesktop" TEXT,
    "imageMobile" TEXT,
    "bgColor" TEXT,
    "position" TEXT NOT NULL DEFAULT 'home-hero',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."menu_items" (
    "id" TEXT NOT NULL,
    "menuKey" TEXT NOT NULL DEFAULT 'main',
    "label" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "iconKey" TEXT,
    "parentId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."redirects" (
    "id" TEXT NOT NULL,
    "fromPath" TEXT NOT NULL,
    "toPath" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL DEFAULT 301,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "hitCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "redirects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."reviews" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "userId" TEXT,
    "orderId" TEXT,
    "displayName" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "titleFa" TEXT,
    "bodyFa" TEXT NOT NULL,
    "status" "public"."ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "isVerifiedPurchase" BOOLEAN NOT NULL DEFAULT false,
    "adminReplyFa" TEXT,
    "adminReplyAt" TIMESTAMP(3),
    "helpfulCount" INTEGER NOT NULL DEFAULT 0,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."newsletter_subscribers" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "confirmToken" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "newsletter_subscribers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."wishlist_items" (
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wishlist_items_pkey" PRIMARY KEY ("userId","productId")
);

-- CreateTable
CREATE TABLE "public"."recently_viewed" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sessionKey" TEXT,
    "productId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recently_viewed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."search_query_logs" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "normalized" TEXT NOT NULL,
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_query_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ticket_departments" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameFa" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ticket_departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tickets" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "departmentId" TEXT,
    "orderId" TEXT,
    "subject" TEXT NOT NULL,
    "priority" "public"."TicketPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "public"."TicketStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToId" TEXT,
    "lastReplyAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ticket_messages" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT,
    "isStaff" BOOLEAN NOT NULL DEFAULT false,
    "bodyFa" TEXT NOT NULL,
    "attachments" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "channel" "public"."NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "href" TEXT,
    "payload" JSONB,
    "status" "public"."NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "readAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."notification_templates" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" "public"."NotificationChannel" NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "group" TEXT NOT NULL DEFAULT 'general',
    "isSecret" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "public"."audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" "public"."ActorType" NOT NULL DEFAULT 'SYSTEM',
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."rate_limit_hits" (
    "id" TEXT NOT NULL,
    "bucketKey" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rate_limit_hits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."job_queue" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "public"."JobStatus" NOT NULL DEFAULT 'QUEUED',
    "runAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lastError" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."webhook_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "signature" TEXT,
    "payload" JSONB NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "public"."users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_referralCode_key" ON "public"."users"("referralCode");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "public"."users"("status");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "public"."users"("createdAt");

-- CreateIndex
CREATE INDEX "users_customerGroupId_idx" ON "public"."users"("customerGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_tokenHash_key" ON "public"."sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "public"."sessions"("userId");

-- CreateIndex
CREATE INDEX "sessions_expiresAt_idx" ON "public"."sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "verification_tokens_identifier_purpose_idx" ON "public"."verification_tokens"("identifier", "purpose");

-- CreateIndex
CREATE INDEX "verification_tokens_expiresAt_idx" ON "public"."verification_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "roles_slug_key" ON "public"."roles"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "public"."permissions"("key");

-- CreateIndex
CREATE INDEX "permissions_group_idx" ON "public"."permissions"("group");

-- CreateIndex
CREATE UNIQUE INDEX "customer_groups_slug_key" ON "public"."customer_groups"("slug");

-- CreateIndex
CREATE INDEX "addresses_userId_idx" ON "public"."addresses"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "public"."categories"("slug");

-- CreateIndex
CREATE INDEX "categories_parentId_idx" ON "public"."categories"("parentId");

-- CreateIndex
CREATE INDEX "categories_isActive_sortOrder_idx" ON "public"."categories"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "brands_slug_key" ON "public"."brands"("slug");

-- CreateIndex
CREATE INDEX "brands_isActive_idx" ON "public"."brands"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "platforms_slug_key" ON "public"."platforms"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "regions_code_key" ON "public"."regions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "tags_slug_key" ON "public"."tags"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "public"."products"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "public"."products"("sku");

-- CreateIndex
CREATE INDEX "products_status_isFeatured_idx" ON "public"."products"("status", "isFeatured");

-- CreateIndex
CREATE INDEX "products_status_isPopular_idx" ON "public"."products"("status", "isPopular");

-- CreateIndex
CREATE INDEX "products_categoryId_status_idx" ON "public"."products"("categoryId", "status");

-- CreateIndex
CREATE INDEX "products_brandId_status_idx" ON "public"."products"("brandId", "status");

-- CreateIndex
CREATE INDEX "products_platformId_idx" ON "public"."products"("platformId");

-- CreateIndex
CREATE INDEX "products_status_createdAt_idx" ON "public"."products"("status", "createdAt");

-- CreateIndex
CREATE INDEX "products_status_salesCount_idx" ON "public"."products"("status", "salesCount");

-- CreateIndex
CREATE UNIQUE INDEX "product_relations_sourceId_targetId_kind_key" ON "public"."product_relations"("sourceId", "targetId", "kind");

-- CreateIndex
CREATE INDEX "product_media_productId_kind_sortOrder_idx" ON "public"."product_media"("productId", "kind", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_sku_key" ON "public"."product_variants"("sku");

-- CreateIndex
CREATE INDEX "product_variants_productId_isActive_sortOrder_idx" ON "public"."product_variants"("productId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "product_variants_regionId_idx" ON "public"."product_variants"("regionId");

-- CreateIndex
CREATE INDEX "product_variants_supplierId_idx" ON "public"."product_variants"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "bulk_price_tiers_variantId_minQty_key" ON "public"."bulk_price_tiers"("variantId", "minQty");

-- CreateIndex
CREATE INDEX "exchange_rates_currencyCode_isActive_effectiveAt_idx" ON "public"."exchange_rates"("currencyCode", "isActive", "effectiveAt");

-- CreateIndex
CREATE INDEX "pricing_rules_scope_targetId_isActive_idx" ON "public"."pricing_rules"("scope", "targetId", "isActive");

-- CreateIndex
CREATE INDEX "price_history_variantId_createdAt_idx" ON "public"."price_history"("variantId", "createdAt");

-- CreateIndex
CREATE INDEX "price_change_approvals_status_createdAt_idx" ON "public"."price_change_approvals"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "public"."coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_isActive_startsAt_endsAt_idx" ON "public"."coupons"("isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "coupon_redemptions_couponId_userId_idx" ON "public"."coupon_redemptions"("couponId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_slug_key" ON "public"."campaigns"("slug");

-- CreateIndex
CREATE INDEX "campaigns_isActive_startsAt_endsAt_idx" ON "public"."campaigns"("isActive", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_slug_key" ON "public"."suppliers"("slug");

-- CreateIndex
CREATE INDEX "inventory_batches_variantId_createdAt_idx" ON "public"."inventory_batches"("variantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_codeFingerprint_key" ON "public"."inventory_items"("codeFingerprint");

-- CreateIndex
CREATE INDEX "inventory_items_variantId_status_idx" ON "public"."inventory_items"("variantId", "status");

-- CreateIndex
CREATE INDEX "inventory_items_status_reservedUntil_idx" ON "public"."inventory_items"("status", "reservedUntil");

-- CreateIndex
CREATE INDEX "inventory_items_reservedForOrderId_idx" ON "public"."inventory_items"("reservedForOrderId");

-- CreateIndex
CREATE INDEX "inventory_audit_logs_itemId_createdAt_idx" ON "public"."inventory_audit_logs"("itemId", "createdAt");

-- CreateIndex
CREATE INDEX "inventory_audit_logs_action_createdAt_idx" ON "public"."inventory_audit_logs"("action", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "stock_alerts_variantId_key" ON "public"."stock_alerts"("variantId");

-- CreateIndex
CREATE UNIQUE INDEX "carts_sessionKey_key" ON "public"."carts"("sessionKey");

-- CreateIndex
CREATE INDEX "carts_userId_idx" ON "public"."carts"("userId");

-- CreateIndex
CREATE INDEX "carts_expiresAt_idx" ON "public"."carts"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_cartId_variantId_key" ON "public"."cart_items"("cartId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_orderNumber_key" ON "public"."orders"("orderNumber");

-- CreateIndex
CREATE INDEX "orders_userId_createdAt_idx" ON "public"."orders"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "orders_status_createdAt_idx" ON "public"."orders"("status", "createdAt");

-- CreateIndex
CREATE INDEX "orders_paymentStatus_idx" ON "public"."orders"("paymentStatus");

-- CreateIndex
CREATE INDEX "orders_needsReview_idx" ON "public"."orders"("needsReview");

-- CreateIndex
CREATE INDEX "orders_createdAt_idx" ON "public"."orders"("createdAt");

-- CreateIndex
CREATE INDEX "order_items_orderId_idx" ON "public"."order_items"("orderId");

-- CreateIndex
CREATE INDEX "order_status_history_orderId_createdAt_idx" ON "public"."order_status_history"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotencyKey_key" ON "public"."payments"("idempotencyKey");

-- CreateIndex
CREATE INDEX "payments_orderId_idx" ON "public"."payments"("orderId");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "public"."payments"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_gateway_authority_key" ON "public"."payments"("gateway", "authority");

-- CreateIndex
CREATE INDEX "refunds_orderId_idx" ON "public"."refunds"("orderId");

-- CreateIndex
CREATE INDEX "refunds_status_idx" ON "public"."refunds"("status");

-- CreateIndex
CREATE INDEX "deliveries_orderItemId_idx" ON "public"."deliveries"("orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_orderId_key" ON "public"."invoices"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "public"."invoices"("number");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_transactions_idempotencyKey_key" ON "public"."wallet_transactions"("idempotencyKey");

-- CreateIndex
CREATE INDEX "wallet_transactions_userId_createdAt_idx" ON "public"."wallet_transactions"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "loyalty_transactions_userId_createdAt_idx" ON "public"."loyalty_transactions"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "pages_slug_key" ON "public"."pages"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "blog_posts_slug_key" ON "public"."blog_posts"("slug");

-- CreateIndex
CREATE INDEX "blog_posts_status_publishedAt_idx" ON "public"."blog_posts"("status", "publishedAt");

-- CreateIndex
CREATE INDEX "faqs_group_isActive_sortOrder_idx" ON "public"."faqs"("group", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "banners_position_isActive_sortOrder_idx" ON "public"."banners"("position", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "menu_items_menuKey_isActive_sortOrder_idx" ON "public"."menu_items"("menuKey", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "redirects_fromPath_key" ON "public"."redirects"("fromPath");

-- CreateIndex
CREATE INDEX "reviews_productId_status_createdAt_idx" ON "public"."reviews"("productId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_email_key" ON "public"."newsletter_subscribers"("email");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_subscribers_confirmToken_key" ON "public"."newsletter_subscribers"("confirmToken");

-- CreateIndex
CREATE INDEX "recently_viewed_viewedAt_idx" ON "public"."recently_viewed"("viewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "recently_viewed_userId_productId_key" ON "public"."recently_viewed"("userId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "recently_viewed_sessionKey_productId_key" ON "public"."recently_viewed"("sessionKey", "productId");

-- CreateIndex
CREATE INDEX "search_query_logs_normalized_createdAt_idx" ON "public"."search_query_logs"("normalized", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ticket_departments_slug_key" ON "public"."ticket_departments"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_number_key" ON "public"."tickets"("number");

-- CreateIndex
CREATE INDEX "tickets_userId_createdAt_idx" ON "public"."tickets"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "tickets_status_priority_idx" ON "public"."tickets"("status", "priority");

-- CreateIndex
CREATE INDEX "ticket_messages_ticketId_createdAt_idx" ON "public"."ticket_messages"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "public"."notifications"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "public"."notifications"("status");

-- CreateIndex
CREATE UNIQUE INDEX "notification_templates_key_channel_key" ON "public"."notification_templates"("key", "channel");

-- CreateIndex
CREATE INDEX "settings_group_idx" ON "public"."settings"("group");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_createdAt_idx" ON "public"."audit_logs"("entity", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "public"."audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_action_createdAt_idx" ON "public"."audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "rate_limit_hits_expiresAt_idx" ON "public"."rate_limit_hits"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "rate_limit_hits_bucketKey_windowStart_key" ON "public"."rate_limit_hits"("bucketKey", "windowStart");

-- CreateIndex
CREATE UNIQUE INDEX "job_queue_idempotencyKey_key" ON "public"."job_queue"("idempotencyKey");

-- CreateIndex
CREATE INDEX "job_queue_status_runAt_idx" ON "public"."job_queue"("status", "runAt");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_provider_eventId_key" ON "public"."webhook_events"("provider", "eventId");

-- AddForeignKey
ALTER TABLE "public"."users" ADD CONSTRAINT "users_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."users" ADD CONSTRAINT "users_customerGroupId_fkey" FOREIGN KEY ("customerGroupId") REFERENCES "public"."customer_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."verification_tokens" ADD CONSTRAINT "verification_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "public"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "public"."permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_roles" ADD CONSTRAINT "user_roles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."user_roles" ADD CONSTRAINT "user_roles_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "public"."roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."addresses" ADD CONSTRAINT "addresses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."products" ADD CONSTRAINT "products_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "public"."brands"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."products" ADD CONSTRAINT "products_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "public"."platforms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."product_tags" ADD CONSTRAINT "product_tags_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."product_tags" ADD CONSTRAINT "product_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "public"."tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."product_relations" ADD CONSTRAINT "product_relations_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "public"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."product_relations" ADD CONSTRAINT "product_relations_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "public"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."product_media" ADD CONSTRAINT "product_media_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."product_media" ADD CONSTRAINT "product_media_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "public"."product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."product_variants" ADD CONSTRAINT "product_variants_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "public"."currencies"("code") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."product_variants" ADD CONSTRAINT "product_variants_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "public"."regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."product_variants" ADD CONSTRAINT "product_variants_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "public"."platforms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."product_variants" ADD CONSTRAINT "product_variants_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."bulk_price_tiers" ADD CONSTRAINT "bulk_price_tiers_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "public"."product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."exchange_rates" ADD CONSTRAINT "exchange_rates_currencyCode_fkey" FOREIGN KEY ("currencyCode") REFERENCES "public"."currencies"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."pricing_rules" ADD CONSTRAINT "pricing_rules_customerGroupId_fkey" FOREIGN KEY ("customerGroupId") REFERENCES "public"."customer_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."price_history" ADD CONSTRAINT "price_history_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "public"."product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."price_change_approvals" ADD CONSTRAINT "price_change_approvals_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "public"."product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."price_change_approvals" ADD CONSTRAINT "price_change_approvals_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."price_change_approvals" ADD CONSTRAINT "price_change_approvals_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "public"."coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."coupon_redemptions" ADD CONSTRAINT "coupon_redemptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."campaign_products" ADD CONSTRAINT "campaign_products_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "public"."campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."campaign_products" ADD CONSTRAINT "campaign_products_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."inventory_batches" ADD CONSTRAINT "inventory_batches_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "public"."product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."inventory_batches" ADD CONSTRAINT "inventory_batches_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."inventory_batches" ADD CONSTRAINT "inventory_batches_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."inventory_items" ADD CONSTRAINT "inventory_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "public"."product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."inventory_items" ADD CONSTRAINT "inventory_items_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "public"."suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."inventory_items" ADD CONSTRAINT "inventory_items_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "public"."inventory_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."inventory_audit_logs" ADD CONSTRAINT "inventory_audit_logs_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "public"."inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."inventory_audit_logs" ADD CONSTRAINT "inventory_audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."carts" ADD CONSTRAINT "carts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cart_items" ADD CONSTRAINT "cart_items_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "public"."carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."cart_items" ADD CONSTRAINT "cart_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "public"."product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."orders" ADD CONSTRAINT "orders_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "public"."coupons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."order_items" ADD CONSTRAINT "order_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "public"."product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."order_status_history" ADD CONSTRAINT "order_status_history_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."order_status_history" ADD CONSTRAINT "order_status_history_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."payments" ADD CONSTRAINT "payments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."refunds" ADD CONSTRAINT "refunds_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "public"."payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."refunds" ADD CONSTRAINT "refunds_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."refunds" ADD CONSTRAINT "refunds_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deliveries" ADD CONSTRAINT "deliveries_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "public"."order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."deliveries" ADD CONSTRAINT "deliveries_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "public"."inventory_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."invoices" ADD CONSTRAINT "invoices_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."wallet_transactions" ADD CONSTRAINT "wallet_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."loyalty_transactions" ADD CONSTRAINT "loyalty_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."blog_posts" ADD CONSTRAINT "blog_posts_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."faqs" ADD CONSTRAINT "faqs_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "public"."categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."faqs" ADD CONSTRAINT "faqs_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."menu_items" ADD CONSTRAINT "menu_items_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "public"."menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."reviews" ADD CONSTRAINT "reviews_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."wishlist_items" ADD CONSTRAINT "wishlist_items_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."wishlist_items" ADD CONSTRAINT "wishlist_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."recently_viewed" ADD CONSTRAINT "recently_viewed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."recently_viewed" ADD CONSTRAINT "recently_viewed_productId_fkey" FOREIGN KEY ("productId") REFERENCES "public"."products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tickets" ADD CONSTRAINT "tickets_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tickets" ADD CONSTRAINT "tickets_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "public"."ticket_departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tickets" ADD CONSTRAINT "tickets_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "public"."orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tickets" ADD CONSTRAINT "tickets_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ticket_messages" ADD CONSTRAINT "ticket_messages_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "public"."tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ticket_messages" ADD CONSTRAINT "ticket_messages_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
