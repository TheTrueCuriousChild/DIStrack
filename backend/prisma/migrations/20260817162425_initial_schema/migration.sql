-- CreateEnum
CREATE TYPE "FacilityType" AS ENUM ('organization', 'hospital', 'vendor', 'warehouse');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'government', 'hospital_staff', 'vendor_staff', 'warehouse_staff');

-- CreateEnum
CREATE TYPE "IndentStatus" AS ENUM ('submitted', 'approved', 'rejected', 'partially_fulfilled', 'fulfilled');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('normal', 'urgent', 'emergency');

-- CreateEnum
CREATE TYPE "IndentItemStatus" AS ENUM ('pending', 'approved', 'rejected', 'fulfilled');

-- CreateEnum
CREATE TYPE "SupplyOrderStatus" AS ENUM ('created', 'confirmed', 'dispatched', 'delivered', 'cancelled');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('packing', 'dispatched', 'in_transit', 'delivered');

-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('complete', 'partial', 'damaged');

-- CreateEnum
CREATE TYPE "StockTransactionType" AS ENUM ('receipt', 'consumption', 'wastage', 'transfer_out', 'transfer_in', 'adjustment');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('pending', 'in_transit', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "WastageReason" AS ENUM ('expired', 'damaged', 'other');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('open', 'acknowledged', 'resolved');

-- CreateTable
CREATE TABLE "Facility" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "parentFacilityId" UUID,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "type" "FacilityType" NOT NULL,
    "tier" TEXT,
    "address" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Facility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "facilityId" UUID,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Drug" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "category" TEXT,
    "unit" TEXT NOT NULL,
    "storageCondition" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Drug_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "drugId" UUID NOT NULL,
    "batchNo" TEXT NOT NULL,
    "manufacturer" TEXT,
    "manufacturingDate" DATE,
    "expiryDate" DATE NOT NULL,
    "qrCode" TEXT,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Indent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requestingFacilityId" UUID NOT NULL,
    "status" "IndentStatus" NOT NULL DEFAULT 'submitted',
    "priority" "Priority" NOT NULL DEFAULT 'normal',
    "createdBy" UUID NOT NULL,
    "approvedBy" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(6),

    CONSTRAINT "Indent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndentItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "indentId" UUID NOT NULL,
    "drugId" UUID NOT NULL,
    "quantityRequested" DECIMAL NOT NULL,
    "quantityApproved" DECIMAL,
    "status" "IndentItemStatus" NOT NULL DEFAULT 'pending',

    CONSTRAINT "IndentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "facilityId" UUID,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "email" TEXT,
    "performanceScore" DECIMAL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyOrder" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vendorId" UUID NOT NULL,
    "status" "SupplyOrderStatus" NOT NULL DEFAULT 'created',
    "expectedDelivery" DATE,
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplyOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplyOrderItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "supplyOrderId" UUID NOT NULL,
    "drugId" UUID NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "unitPrice" DECIMAL,

    CONSTRAINT "SupplyOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IndentItemFulfillment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "indentItemId" UUID NOT NULL,
    "supplyOrderItemId" UUID NOT NULL,
    "quantityAllocated" DECIMAL NOT NULL,

    CONSTRAINT "IndentItemFulfillment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shipment" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "supplyOrderId" UUID NOT NULL,
    "trackingNumber" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'packing',
    "dispatchedAt" TIMESTAMP(6),
    "deliveredAt" TIMESTAMP(6),

    CONSTRAINT "Shipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShipmentEvent" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shipmentId" UUID NOT NULL,
    "status" TEXT NOT NULL,
    "location" TEXT,
    "occurredAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShipmentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Receipt" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "shipmentId" UUID NOT NULL,
    "receivingFacilityId" UUID NOT NULL,
    "receivedBy" UUID NOT NULL,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'complete',
    "notes" TEXT,
    "receivedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptItem" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "receiptId" UUID NOT NULL,
    "drugId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "quantityReceived" DECIMAL NOT NULL,
    "quantityDamaged" DECIMAL NOT NULL DEFAULT 0,

    CONSTRAINT "ReceiptItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockLedger" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "facilityId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "txnType" "StockTransactionType" NOT NULL,
    "referenceType" TEXT,
    "referenceId" UUID,
    "actorUserId" UUID,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "fromFacilityId" UUID NOT NULL,
    "toFacilityId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "reason" TEXT,
    "status" "TransferStatus" NOT NULL DEFAULT 'pending',
    "createdBy" UUID NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consumption" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "facilityId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "drugId" UUID NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "recordedBy" UUID NOT NULL,
    "consumedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wastage" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "facilityId" UUID NOT NULL,
    "batchId" UUID NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "reason" "WastageReason" NOT NULL,
    "recordedBy" UUID NOT NULL,
    "recordedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wastage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MlPrediction" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "facilityId" UUID,
    "drugId" UUID,
    "type" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "confidence" DECIMAL,
    "modelVersion" TEXT,
    "generatedAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MlPrediction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "facilityId" UUID,
    "drugId" UUID,
    "batchId" UUID,
    "type" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(6),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "actorUserId" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "createdAt" TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Facility_code_key" ON "Facility"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_qrCode_key" ON "Batch"("qrCode");

-- CreateIndex
CREATE UNIQUE INDEX "Batch_drugId_batchNo_key" ON "Batch"("drugId", "batchNo");

-- AddForeignKey
ALTER TABLE "Facility" ADD CONSTRAINT "Facility_parentFacilityId_fkey" FOREIGN KEY ("parentFacilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "Drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Indent" ADD CONSTRAINT "Indent_requestingFacilityId_fkey" FOREIGN KEY ("requestingFacilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Indent" ADD CONSTRAINT "Indent_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Indent" ADD CONSTRAINT "Indent_approvedBy_fkey" FOREIGN KEY ("approvedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndentItem" ADD CONSTRAINT "IndentItem_indentId_fkey" FOREIGN KEY ("indentId") REFERENCES "Indent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndentItem" ADD CONSTRAINT "IndentItem_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "Drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrder" ADD CONSTRAINT "SupplyOrder_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrder" ADD CONSTRAINT "SupplyOrder_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrderItem" ADD CONSTRAINT "SupplyOrderItem_supplyOrderId_fkey" FOREIGN KEY ("supplyOrderId") REFERENCES "SupplyOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplyOrderItem" ADD CONSTRAINT "SupplyOrderItem_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "Drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndentItemFulfillment" ADD CONSTRAINT "IndentItemFulfillment_indentItemId_fkey" FOREIGN KEY ("indentItemId") REFERENCES "IndentItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IndentItemFulfillment" ADD CONSTRAINT "IndentItemFulfillment_supplyOrderItemId_fkey" FOREIGN KEY ("supplyOrderItemId") REFERENCES "SupplyOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shipment" ADD CONSTRAINT "Shipment_supplyOrderId_fkey" FOREIGN KEY ("supplyOrderId") REFERENCES "SupplyOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShipmentEvent" ADD CONSTRAINT "ShipmentEvent_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "Shipment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_receivingFacilityId_fkey" FOREIGN KEY ("receivingFacilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_receivedBy_fkey" FOREIGN KEY ("receivedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "Receipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "Drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptItem" ADD CONSTRAINT "ReceiptItem_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockLedger" ADD CONSTRAINT "StockLedger_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromFacilityId_fkey" FOREIGN KEY ("fromFacilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toFacilityId_fkey" FOREIGN KEY ("toFacilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consumption" ADD CONSTRAINT "Consumption_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consumption" ADD CONSTRAINT "Consumption_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consumption" ADD CONSTRAINT "Consumption_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "Drug"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consumption" ADD CONSTRAINT "Consumption_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wastage" ADD CONSTRAINT "Wastage_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wastage" ADD CONSTRAINT "Wastage_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Wastage" ADD CONSTRAINT "Wastage_recordedBy_fkey" FOREIGN KEY ("recordedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MlPrediction" ADD CONSTRAINT "MlPrediction_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MlPrediction" ADD CONSTRAINT "MlPrediction_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "Drug"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_facilityId_fkey" FOREIGN KEY ("facilityId") REFERENCES "Facility"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_drugId_fkey" FOREIGN KEY ("drugId") REFERENCES "Drug"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
